export function auditTechnicalSeo(pages = []) {
  const crawlErrors = pages.filter((p) => p.httpStatus >= 400).length;
  const slowPages = pages.filter((p) => p.lcpSeconds > 2.5).length;
  return {
    totalPagesAudited: pages.length,
    crawlErrorCount: crawlErrors,
    poorCoreWebVitalsCount: slowPages,
    seoHealthIndexPct:
      pages.length > 0 ? Math.round(((pages.length - crawlErrors - slowPages) / pages.length) * 100) : 100,
  };
}
