#!/usr/bin/env python3
"""Create a dependency-free three-statement Excel starter model."""

from __future__ import annotations

import argparse
import html
import os
import re
import zipfile
from dataclasses import dataclass
from typing import Iterable


@dataclass
class Cell:
    value: str | int | float
    kind: str = "str"
    style: int = 0


def col_letter(index: int) -> str:
    letters = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def ref(row: int, col: int) -> str:
    return f"{col_letter(col)}{row}"


def sheet_quote(name: str) -> str:
    return f"'{name.replace(chr(39), chr(39) * 2)}'"


def safe_sheet_filename(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", name)


def xml_text(value: object) -> str:
    return html.escape(str(value), quote=True)


def s(value: object, style: int = 0) -> Cell:
    return Cell(str(value), "str", style)


def n(value: int | float, style: int = 0) -> Cell:
    return Cell(value, "num", style)


def f(formula: str, style: int = 0) -> Cell:
    return Cell(formula.lstrip("="), "formula", style)


def empty() -> Cell:
    return Cell("", "empty", 0)


def row(label: str, *values: Cell) -> list[Cell]:
    return [s(label, 2), *values]


def formula_row(label: str, formulas: Iterable[str], style: int = 4) -> list[Cell]:
    return [s(label, 2), *[f(formula, style) for formula in formulas]]


def cells_to_sheet_xml(rows: list[list[Cell]]) -> str:
    xml_rows = []
    for row_index, row_cells in enumerate(rows, start=1):
        cell_xml = []
        for col_index, cell in enumerate(row_cells, start=1):
            if cell.kind == "empty":
                continue
            address = ref(row_index, col_index)
            style_attr = f' s="{cell.style}"' if cell.style else ""
            if cell.kind == "str":
                cell_xml.append(
                    f'<c r="{address}" t="inlineStr"{style_attr}><is><t>{xml_text(cell.value)}</t></is></c>'
                )
            elif cell.kind == "formula":
                cell_xml.append(f'<c r="{address}"{style_attr}><f>{xml_text(cell.value)}</f></c>')
            else:
                cell_xml.append(f'<c r="{address}"{style_attr}><v>{cell.value}</v></c>')
        xml_rows.append(f'<row r="{row_index}">{"".join(cell_xml)}</row>')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
        '<sheetFormatPr defaultRowHeight="15"/>'
        '<cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="20" width="15" customWidth="1"/></cols>'
        f'<sheetData>{"".join(xml_rows)}</sheetData>'
        '</worksheet>'
    )


def workbook_xml(sheet_names: list[str]) -> str:
    sheet_entries = "".join(
        f'<sheet name="{xml_text(name)}" sheetId="{index}" r:id="rId{index}"/>'
        for index, name in enumerate(sheet_names, start=1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets>{sheet_entries}</sheets>'
        '</workbook>'
    )


def workbook_rels(sheet_names: list[str]) -> str:
    rels = [
        f'<Relationship Id="rId{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/{safe_sheet_filename(name)}.xml"/>'
        for index, name in enumerate(sheet_names, start=1)
    ]
    rels.append(
        f'<Relationship Id="rId{len(sheet_names) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'{"".join(rels)}'
        '</Relationships>'
    )


def content_types(sheet_names: list[str]) -> str:
    overrides = [
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    ]
    overrides.extend(
        f'<Override PartName="/xl/worksheets/{safe_sheet_filename(name)}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for name in sheet_names
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        f'{"".join(overrides)}'
        '</Types>'
    )


def root_rels() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        '</Relationships>'
    )


def styles_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0;[Red](#,##0);-"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts>'
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/><bgColor indexed="64"/></patternFill></fill></fills>'
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="6">'
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
        '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
        '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>'
        '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
        '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        '</styleSheet>'
    )


def build_model(company: str, start_year: int, years: int, currency: str, base_revenue: float) -> dict[str, list[list[Cell]]]:
    period_labels = [str(start_year + offset) for offset in range(years)]
    period_header = [s("Metric", 1), *[s(label, 1) for label in period_labels]]

    assumptions = [
        [s(f"{company} Three-Statement Model", 1)],
        [s("Currency", 2), s(currency)],
        [s("Display unit", 2), s("Units")],
        [],
        period_header,
        row("Revenue", n(base_revenue, 3), *[f(f"{ref(6, col - 1)}*(1+{ref(7, col)})", 3) for col in range(3, years + 2)]),
        row("Revenue growth", n(0.25, 5), *[n(0.20, 5) for _ in range(years - 1)]),
        row("Gross margin", *[n(0.70, 5) for _ in range(years)]),
        row("Opex % revenue", *[n(0.45, 5) for _ in range(years)]),
        row("D&A % revenue", *[n(0.04, 5) for _ in range(years)]),
        row("Capex % revenue", *[n(0.06, 5) for _ in range(years)]),
        row("Tax rate", *[n(0.21, 5) for _ in range(years)]),
        row("Interest rate", *[n(0.08, 5) for _ in range(years)]),
        row("Dividend payout % NI", *[n(0.00, 5) for _ in range(years)]),
        row("AR days", *[n(45, 3) for _ in range(years)]),
        row("Inventory days", *[n(30, 3) for _ in range(years)]),
        row("AP days", *[n(35, 3) for _ in range(years)]),
        row("Debt issuance", *[n(0, 3) for _ in range(years)]),
        row("Debt repayment", *[n(0, 3) for _ in range(years)]),
        [],
        [s("Opening balances", 1)],
        [s("Opening cash", 2), n(base_revenue * 0.20, 3)],
        [s("Opening AR", 2), n(base_revenue / 365 * 45, 3)],
        [s("Opening inventory", 2), n(base_revenue * 0.30 / 365 * 30, 3)],
        [s("Opening PP&E", 2), n(base_revenue * 0.30, 3)],
        [s("Opening AP", 2), n(base_revenue * 0.30 / 365 * 35, 3)],
        [s("Opening debt", 2), n(base_revenue * 0.10, 3)],
        [s("Opening equity", 2), f("B22+B23+B24+B25-B26-B27", 3)],
    ]

    a = sheet_quote("Assumptions")
    income = [period_header]
    income.extend(
        [
            formula_row("Revenue", [f"{a}!{ref(6, col)}" for col in range(2, years + 2)]),
            formula_row("COGS", [f"-B2*(1-{a}!B8)" if col == 2 else f"-{ref(2, col)}*(1-{a}!{ref(8, col)})" for col in range(2, years + 2)]),
            formula_row("Gross profit", [f"{ref(2, col)}+{ref(3, col)}" for col in range(2, years + 2)]),
            formula_row("Operating expenses", [f"-{ref(2, col)}*{a}!{ref(9, col)}" for col in range(2, years + 2)]),
            formula_row("EBITDA", [f"{ref(4, col)}+{ref(5, col)}" for col in range(2, years + 2)]),
            formula_row("D&A", [f"-{ref(2, col)}*{a}!{ref(10, col)}" for col in range(2, years + 2)]),
            formula_row("EBIT", [f"{ref(6, col)}+{ref(7, col)}" for col in range(2, years + 2)]),
            formula_row(
                "Interest expense",
                [
                    f"-{a}!B27*{a}!B13" if col == 2 else f"-'Balance Sheet'!{ref(9, col - 1)}*{a}!{ref(13, col)}"
                    for col in range(2, years + 2)
                ],
            ),
            formula_row("Pre-tax income", [f"{ref(8, col)}+{ref(9, col)}" for col in range(2, years + 2)]),
            formula_row("Taxes", [f"-MAX(0,{ref(10, col)}*{a}!{ref(12, col)})" for col in range(2, years + 2)]),
            formula_row("Net income", [f"{ref(10, col)}+{ref(11, col)}" for col in range(2, years + 2)]),
        ]
    )

    bs_name = sheet_quote("Balance Sheet")
    is_name = sheet_quote("Income Statement")
    cf_name = sheet_quote("Cash Flow")
    balance = [period_header]
    balance.extend(
        [
            formula_row("Cash", [f"{cf_name}!{ref(10, col)}" for col in range(2, years + 2)]),
            formula_row("Accounts receivable", [f"{is_name}!{ref(2, col)}/365*{a}!{ref(15, col)}" for col in range(2, years + 2)]),
            formula_row("Inventory", [f"ABS({is_name}!{ref(3, col)})/365*{a}!{ref(16, col)}" for col in range(2, years + 2)]),
            formula_row("Total current assets", [f"SUM({ref(2, col)}:{ref(4, col)})" for col in range(2, years + 2)]),
            formula_row(
                "PP&E, net",
                [
                    f"{a}!B25+ABS({cf_name}!{ref(6, col)})+{is_name}!{ref(7, col)}" if col == 2 else f"{ref(6, col - 1)}+ABS({cf_name}!{ref(6, col)})+{is_name}!{ref(7, col)}"
                    for col in range(2, years + 2)
                ],
            ),
            formula_row("Total assets", [f"{ref(5, col)}+{ref(6, col)}" for col in range(2, years + 2)]),
            formula_row("Accounts payable", [f"ABS({is_name}!{ref(3, col)})/365*{a}!{ref(17, col)}" for col in range(2, years + 2)]),
            formula_row(
                "Debt",
                [
                    f"{a}!B27+{a}!{ref(18, col)}-{a}!{ref(19, col)}" if col == 2 else f"{ref(9, col - 1)}+{a}!{ref(18, col)}-{a}!{ref(19, col)}"
                    for col in range(2, years + 2)
                ],
            ),
            formula_row(
                "Equity",
                [
                    f"{a}!B28+{is_name}!{ref(12, col)}-{cf_name}!{ref(9, col)}" if col == 2 else f"{ref(10, col - 1)}+{is_name}!{ref(12, col)}-{cf_name}!{ref(9, col)}"
                    for col in range(2, years + 2)
                ],
            ),
            formula_row("Total liabilities & equity", [f"{ref(8, col)}+{ref(9, col)}+{ref(10, col)}" for col in range(2, years + 2)]),
            formula_row("Balance check", [f"{ref(7, col)}-{ref(11, col)}" for col in range(2, years + 2)]),
        ]
    )

    cash_flow = [period_header]
    cash_flow.extend(
        [
            formula_row("Net income", [f"{is_name}!{ref(12, col)}" for col in range(2, years + 2)]),
            formula_row("D&A add-back", [f"ABS({is_name}!{ref(7, col)})" for col in range(2, years + 2)]),
            formula_row(
                "Change in working capital",
                [
                    f"-(({bs_name}!B3-{a}!B23)+({bs_name}!B4-{a}!B24)-({bs_name}!B8-{a}!B26))"
                    if col == 2
                    else f"-(({bs_name}!{ref(3, col)}-{bs_name}!{ref(3, col - 1)})+({bs_name}!{ref(4, col)}-{bs_name}!{ref(4, col - 1)})-({bs_name}!{ref(8, col)}-{bs_name}!{ref(8, col - 1)}))"
                    for col in range(2, years + 2)
                ],
            ),
            formula_row("Cash flow from operations", [f"SUM({ref(2, col)}:{ref(4, col)})" for col in range(2, years + 2)]),
            formula_row("Capex", [f"-{is_name}!{ref(2, col)}*{a}!{ref(11, col)}" for col in range(2, years + 2)]),
            formula_row("Debt issuance", [f"{a}!{ref(18, col)}" for col in range(2, years + 2)]),
            formula_row("Debt repayment", [f"-{a}!{ref(19, col)}" for col in range(2, years + 2)]),
            formula_row("Dividends", [f"-MAX(0,{is_name}!{ref(12, col)}*{a}!{ref(14, col)})" for col in range(2, years + 2)]),
            formula_row("Net change in cash", [f"SUM({ref(5, col)}:{ref(9, col)})" for col in range(2, years + 2)]),
            formula_row("Ending cash", [f"{a}!B22+{ref(9, col)}" if col == 2 else f"{ref(10, col - 1)}+{ref(9, col)}" for col in range(2, years + 2)]),
        ]
    )

    checks = [
        period_header,
        formula_row("Balance sheet check", [f"{bs_name}!{ref(12, col)}" for col in range(2, years + 2)]),
        formula_row("Cash tie check", [f"{bs_name}!{ref(2, col)}-{cf_name}!{ref(10, col)}" for col in range(2, years + 2)]),
        formula_row("Net income tie check", [f"{is_name}!{ref(12, col)}-{cf_name}!{ref(2, col)}" for col in range(2, years + 2)]),
        formula_row(
            "Debt tie check",
            [
                f"{bs_name}!B9-({a}!B27+{a}!B18-{a}!B19)" if col == 2 else f"{bs_name}!{ref(9, col)}-({bs_name}!{ref(9, col - 1)}+{a}!{ref(18, col)}-{a}!{ref(19, col)})"
                for col in range(2, years + 2)
            ],
        ),
    ]

    return {
        "Assumptions": assumptions,
        "Income Statement": income,
        "Balance Sheet": balance,
        "Cash Flow": cash_flow,
        "Checks": checks,
    }


def write_xlsx(path: str, sheets: dict[str, list[list[Cell]]]) -> None:
    sheet_names = list(sheets.keys())
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types(sheet_names))
        zf.writestr("_rels/.rels", root_rels())
        zf.writestr("xl/workbook.xml", workbook_xml(sheet_names))
        zf.writestr("xl/_rels/workbook.xml.rels", workbook_rels(sheet_names))
        zf.writestr("xl/styles.xml", styles_xml())
        for name, rows in sheets.items():
            zf.writestr(f"xl/worksheets/{safe_sheet_filename(name)}.xml", cells_to_sheet_xml(rows))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create a three-statement finance model workbook.")
    parser.add_argument("--output", required=True, help="Output .xlsx path.")
    parser.add_argument("--company", default="Company", help="Company/model name.")
    parser.add_argument("--start-year", type=int, default=2026, help="First forecast year.")
    parser.add_argument("--years", type=int, default=5, choices=range(1, 11), metavar="1-10", help="Forecast years.")
    parser.add_argument("--currency", default="USD", help="Model currency label.")
    parser.add_argument("--base-revenue", type=float, default=1_000_000, help="First forecast year revenue.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    sheets = build_model(args.company, args.start_year, args.years, args.currency, args.base_revenue)
    write_xlsx(args.output, sheets)
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
