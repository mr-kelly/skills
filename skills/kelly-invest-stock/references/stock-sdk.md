# No-Key Stock Market Data

Use this reference only when implementing, debugging, or changing market-data
ingestion. These details were checked against the installed `stock-sdk@2.4.0` on
2026-07-29. Re-check the exact package before upgrading because public market-site
interfaces change frequently.

## Fixed Adapter

Use `stock-sdk@2.4.0` exactly. It is a zero-dependency JavaScript/TypeScript adapter
for mainland China, Hong Kong, and US stock market observations and requires no API
key, token, licence, Python, native binary, or runtime service.

Primary references:

- Package: https://www.npmjs.com/package/stock-sdk
- Source: https://github.com/chengzuopeng/stock-sdk
- Documentation: https://stock-sdk.linkdiary.cn

Choose the market from the approved strategy universe. Do not mix currencies,
trading calendars, benchmarks, or symbol formats inside one comparison without
explicit normalization. Futures and options remain outside this skill.

## Approved Capabilities

| Need | Interface | Notes |
| --- | --- | --- |
| Mainland China quotes | `sdk.quotes.cnSimple(symbols)` | Keep the source-confirmed exchange and six-digit code. |
| Hong Kong quotes | `sdk.quotes.hk(symbols)` | Preserve leading zeros and HKD currency. |
| US quotes | `sdk.quotes.us(symbols)` | Preserve ticker and source-confirmed market identity. |
| Bounded market refresh | `sdk.batch.cn/hk/us(options)` | Run in trusted execution with bounded concurrency. |
| Daily/weekly/monthly K-lines | `sdk.kline.cn/hk/us(symbol, options)` | Store period, date window, currency, and adjustment mode. |
| Market-aware security search | `sdk.search(keyword)` | Confirm market and exchange before creating a canonical security. |

The package may use Tencent Finance, Eastmoney, Sina, or another public upstream
source depending on method and version. These are not exchange-authoritative APIs
and provide no service-level agreement. Record the source returned by the SDK; do
not label every row simply as `stock-sdk`.

## Execution Pattern

Run the adapter from a reviewed JavaScript Agent or trusted Workflow that writes
normalized observations to Busabase. Keep it out of AirApp browser code so the UI
remains deterministic, avoids CORS and public-site coupling, and reads only bounded
Busabase resources.

Install or execute the exact version only:

```bash
npm install --save-exact stock-sdk@2.4.0
npx -y stock-sdk@2.4.0 quote HPE AVGO --market us --format json
```

Example trusted-execution usage:

```js
import { StockSDK } from "stock-sdk";

const sdk = new StockSDK({
  retry: { maxRetries: 2, baseDelay: 500 },
  providerPolicies: {
    eastmoney: { timeout: 12000, rateLimit: { requestsPerSecond: 1, maxBurst: 1 } },
  },
});

const rows = await sdk.quotes.us(["HPE", "AVGO"]);
```

Do not load the package from a third-party CDN. Do not install or build packages at
AirApp runtime. If trusted execution requires a reviewed bundle, create it during
scaffolding, commit the exact generated JavaScript, and validate it under the target
runtime before deployment.

## Normalization And Quality Contract

- Identity: retain market, source-confirmed exchange, canonical code/ticker, and raw
  SDK symbol. Do not identify a security by ticker alone across markets.
- Times: store source time when present, `fetched_at` in UTC, and the corresponding
  trading date in the market's timezone.
- Currency: retain source currency and normalize only for explicitly declared
  cross-market reporting. Never sum USD, HKD, and CNY values directly.
- Adjustments: record unadjusted, forward-adjusted, or backward-adjusted on every
  series. Do not compare adjusted history directly with a raw virtual entry price.
- Suspensions and gaps: distinguish suspended, not yet published, unsupported,
  unmapped, and upstream error. Never coerce one of these states to zero.
- Provenance: store `adapter=stock-sdk`, exact adapter version, actual upstream
  source, method, request window, coverage count, and error summary for every run.
- Reconciliation: reject duplicate market/exchange/code/date rows and flag price
  changes that imply an unresolved corporate action or adjustment mismatch.

## Demo Boundary

The bundled Demo uses a fixed, dated US-stock snapshot to exercise strategy and
virtual-ledger behavior. It must not invoke `stock-sdk`, refresh itself, or present
its values as current market observations.

## Failure Behavior

Use bounded concurrency and the adapter's retry, rate-limit, and circuit-breaker
controls. Avoid a request per candidate when a batch method exists. On exhaustion,
preserve the last good observation, mark it stale, create one deduplicated attention
item, and show which strategy or ledger summaries are partial. Never relabel cached
data as fresh and never invent a quote.

Stop and reassess if an upstream site's terms, response shape, availability, or
access controls change. Do not bypass access controls or increase request rates to
work around blocking.
