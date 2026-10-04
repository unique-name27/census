/**
 * Statutory calendar: the recurring HR filing, payment, notice and planning dates of every
 * jurisdiction Census has sites in, bundled from the Hire-to-Retire Atlas (the `calendar` of each
 * `data/country-*.json`, with the jurisdiction's `sources` and the month its research was last
 * verified). Generated; edit the Atlas and regenerate rather than editing entries by hand.
 *
 * Each entry keeps the Atlas wording. `day` is set only where the Atlas names the day (in the
 * title, or a "due" or "by" date in the detail); otherwise the obligation falls somewhere in its
 * month. The Atlas is a working draft, not legal advice: items it marks "verify" were not
 * confirmed against a primary source, so confirm country specifics with employment counsel.
 *
 * Plain data: no imports, so tests and the engine can read it anywhere.
 */

/** A citation: one of the jurisdiction's sources in the Atlas research. */
export interface AtlasSource {
  title: string
  url: string
}

/** A jurisdiction of the Atlas, with where its calendar comes from. */
export interface AtlasJurisdiction {
  /** Atlas id, the `jurisdiction` of `SITES` ('us-ca', 'de'); 'us' is US federal law. */
  id: string
  name: string
  shortName: string
  /** Month the Atlas research for the jurisdiction was last verified (YYYY-MM). */
  lastVerified: string
  /** The Atlas file the entries come from. */
  file: string
  sources: readonly AtlasSource[]
}

export type Recurrence = 'annual' | 'quarterly' | 'monthly'

export interface CalendarEntry {
  jurisdiction: string
  /** 1-12; the first month of the cycle for quarterly entries (then every three months). */
  month: number
  /** Day of the month, when the Atlas names it. */
  day?: number
  title: string
  detail: string
  recurrence: Recurrence
  /** Only in these years (an election, a one-off or a multi-year cycle). */
  years?: readonly number[]
  /** Only in odd years (the Texas legislative cycle). */
  oddYears?: boolean
}

/** Where the bundled entries come from. */
export const ATLAS_CITATION = 'Hire-to-Retire Atlas, statutory calendar (research verified Sep 2026)'

export const ATLAS_JURISDICTIONS: readonly AtlasJurisdiction[] = [
  {
    id: 'us',
    name: 'United States: Federal (+ multi-state)',
    shortName: 'US Federal',
    lastVerified: '2026-09',
    file: 'data/country-us.json',
    sources: [
      {
        title:
          'DiRaimondo & Schroeder: H-1B $100K proclamation extended through Sept 2027; fee blocked by court order (Sept 21, 2026)',
        url: 'https://www.diraimondoschroeder.com/updates/2026/9/21/trump-administration-extends-100000-h-1b-proclamation-through-september-2027-but-fee-remains-blocked-by-court-order',
      },
      {
        title: 'Littler: Appellate court pauses $100,000 H-1B fee policy as appeal continues',
        url: 'https://www.littler.com/news-analysis/asap/appellate-court-pauses-100000-h-1b-fee-policy-appeal-continues',
      },
      {
        title:
          'Akin: EO: Enhancing Program Integrity and Interagency Coordination in the Administration of the H-1B Program (Sept 18, 2026)',
        url: 'https://www.akingump.com/en/insights/blogs/trump-executive-order-tracker/enhancing-program-integrity-and-interagency-coordination-in-the-administration-of-the-h-1b-nonimmigrant-visa-program',
      },
      {
        title: 'Federal Register: Fee for Certain H-1B Petitions (NPRM, Aug 25, 2026)',
        url: 'https://www.federalregister.gov/documents/2026/08/25/2026-17324/fee-for-certain-h-1b-petitions',
      },
      {
        title: 'Federal Register: Weighted Selection Process for Cap-Subject H-1B (final rule, Dec 29, 2025)',
        url: 'https://www.federalregister.gov/documents/2025/12/29/2025-23853/weighted-selection-process-for-registrants-and-petitioners-seeking-to-file-cap-subject-h-1b',
      },
      {
        title: 'SHRM: USCIS reaches FY2027 H-1B cap',
        url: 'https://www.shrm.org/topics-tools/news/talent-acquisition/uscis-reaches-fy2027-h1b-visa-cap',
      },
      {
        title: 'Holland & Knight: DOL proposes sweeping prevailing wage increases (H-1B, H-1B1, E-3, PERM)',
        url: 'https://www.hklaw.com/en/insights/publications/2026/03/dol-targets-prevailing-wages-sweeping-increases-proposed-for-h1b-h1b1',
      },
      {
        title: 'Morgan Lewis: New F-1 rule could delay OPT hiring (Jul 2026)',
        url: 'https://www.morganlewis.com/pubs/2026/07/new-f-1-rule-could-delay-opt-hiring-and-interrupt-employment',
      },
      {
        title: 'Morgan Lewis: ICE rewrites the rules on Form I-9 violations (Apr 2026)',
        url: 'https://www.morganlewis.com/pubs/2026/04/ice-rewrites-the-rules-on-form-i-9-violations',
      },
      {
        title: 'Hunton: Update: NLRB has a quorum (Jan 2026)',
        url: 'https://www.hunton.com/hunton-employment-labor-perspectives/update-nlrb-has-a-quorum',
      },
      {
        title: "Rocky Mountain Employer: NLRB's new Republican majority (Aug 13, 2026)",
        url: 'https://www.rockymountainemployersblog.com/blog/2026/8/13/nlrbs-new-republican-majority-potential-reconsideration-of-biden-era-labor-rules',
      },
      {
        title: 'Littler: EEOC rescinds enforcement guidance on harassment (Jan 2026)',
        url: 'https://www.littler.com/news-analysis/asap/eeoc-rescinds-enforcement-guidance-harassment',
      },
      {
        title: 'EEOC: EEOC proposes rescission of annual race and sex reporting requirements',
        url: 'https://www.eeoc.gov/newsroom/eeoc-proposes-rescission-annual-race-and-sex-reporting-requirements',
      },
      {
        title: "Ogletree: EEOC's abortion accommodation provision in PWFA rule vacated",
        url: 'https://ogletree.com/insights-resources/blog-posts/eeocs-abortion-accommodation-provision-in-pwfa-rule-vacated/',
      },
      {
        title: 'US DOL: Technical amendment restoring EAP exemption regulations (May 14, 2026)',
        url: 'https://www.dol.gov/newsroom/releases/whd/whd20260514',
      },
      {
        title: 'IRS: 401(k) limit increases to $24,500 for 2026',
        url: 'https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500',
      },
      {
        title: 'Mayer Brown: IRS annual limits for benefit plans: 2026 COLAs',
        url: 'https://www.mayerbrown.com/en/insights/publications/2025/12/irs-annual-limits-for-benefit-plans-2026-cost-of-living-adjustments',
      },
      {
        title: 'IMA: 2026 updates to the ACA employer mandate',
        url: 'https://imacorp.com/insights/hr-insights-compliance-2026-updates-aca-employer-mandate',
      },
      {
        title: 'Jackson Lewis: Federal OBBBA round-up: what employers need to know',
        url: 'https://www.jacksonlewis.com/insights/federal-obbba-round-what-employers-need-know-now',
      },
      {
        title: 'IRS: Proposed regulations on employer contributions to Trump Accounts (Aug 11, 2026)',
        url: 'https://www.irs.gov/newsroom/treasury-irs-issue-proposed-regulations-on-employer-contributions-to-trump-accounts-under-the-working-families-tax-cuts',
      },
      {
        title: 'FTC: FTC files to accede to vacatur of Non-Compete Clause Rule (Sept 5, 2025)',
        url: 'https://www.ftc.gov/news-events/news/press-releases/2025/09/federal-trade-commission-files-accede-vacatur-non-compete-clause-rule',
      },
      {
        title:
          'Duane Morris: OFCCP finalizes three rules resetting federal contractor affirmative action (Aug 2026)',
        url: 'https://www.duanemorris.com/alerts/ofccp_finalizes_three_rules_resetting_federal_contractor_affirmative_action_requirements_0826.html',
      },
      {
        title: 'Ropes & Gray: DOJ announces first DEI False Claims Act settlement (Apr 2026)',
        url: 'https://www.ropesgray.com/en/insights/alerts/2026/04/doj-announces-first-dei-false-claims-act-settlement',
      },
      {
        title: 'McDermott: Colorado AI law in flux: replacement bill signed',
        url: 'https://www.mcdermottlaw.com/insights/colorado-ai-law-in-flux-comprehensive-replacement-bill-signed-after-federal-court-blocks-predecessors-enforcement/',
      },
      {
        title: 'Sequoia: Pay transparency update: Virginia, Maine, Connecticut, Delaware (May 2026)',
        url: 'https://www.sequoia.com/2026/05/pay-transparency-update-virginia-maine-delaware/',
      },
    ],
  },
  {
    id: 'us-ca',
    name: 'California',
    shortName: 'California',
    lastVerified: '2026-09',
    file: 'data/country-us-ca.json',
    sources: [
      {
        title: 'DIR: California minimum wage $16.90 for 2026 (exempt $70,304)',
        url: 'https://www.dir.ca.gov/DIRNews/2025/2025-118.html',
      },
      {
        title: 'DIR: Minimum wage to rise to $17.40 on Jan 1, 2027',
        url: 'https://www.dir.ca.gov/DIRNews/2026/2026-66.html',
      },
      {
        title: 'CalChamber HRWatchdog: 2026 computer professional and physician rates',
        url: 'https://hrwatchdog.calchamber.com/2025/10/2026-computer-professionals-licensed-physicians-rates/',
      },
      {
        title: 'CalChamber HRWatchdog: 2026 local minimum wage rates',
        url: 'https://hrwatchdog.calchamber.com/2025/12/california-local-minimum-wage-rates-increases-starting-january-1-2026/',
      },
      {
        title: 'Ogletree: California refines pay transparency requirements (SB 642)',
        url: 'https://ogletree.com/insights-resources/blog-posts/california-refines-pay-transparency-requirements/',
      },
      {
        title: 'Morgan Lewis: California amends pay transparency requirements (SB 642)',
        url: 'https://www.morganlewis.com/pubs/2025/11/california-amends-pay-transparency-requirements',
      },
      {
        title: 'Mayer Brown: Deeper dive into California stay-or-pay limits (AB 692)',
        url: 'https://www.mayerbrown.com/en/insights/publications/2026/03/a-deeper-dive-into-californias-new-limitations-on-stay-or-pay-clauses-as-of-january-1-2026',
      },
      {
        title: "Littler: California's TRAP reset (AB 1697)",
        url: 'https://www.littler.com/news-analysis/asap/californias-trap-reset-new-exceptions-new-timeline-new-questions',
      },
      {
        title: 'CDF: Workplace Know Your Rights Act notices (SB 294)',
        url: 'https://www.cdflaborlaw.com/blog/workplace-know-your-rights-act-notices-effective-february-1-2026',
      },
      {
        title: 'Davis Wright Tremaine: Workplace Know Your Rights template notice',
        url: 'https://www.dwt.com/blogs/employment-labor-and-benefits/2026/01/california-workplace-know-your-rights-template',
      },
      {
        title: 'Mayer Brown: CRD employment AI (ADS) regulations effective Oct 1, 2025',
        url: 'https://www.mayerbrown.com/en/insights/publications/2025/08/california-adopts-new-employment-ai-regulations-effective-october-1-2025',
      },
      {
        title: 'CPPA: CCPA updates, ADMT, risk assessment and cybersecurity audit regulations',
        url: 'https://cppa.ca.gov/regulations/ccpa_updates.html',
      },
      {
        title: 'Thompson Coburn: 2026 CCPA regulations summary and preparation guide',
        url: 'https://www.thompsoncoburn.com/insights/californias-2026-ccpa-regulations-summary-and-preparation-guide/',
      },
      {
        title: 'Fisher Phillips: Governor vetoes No Robo Bosses Act (SB 7)',
        url: 'https://www.fisherphillips.com/en/insights/insights/california-governor-vetoes-no-robo-bosses-act',
      },
      {
        title: 'CDF: Current status of captive audience meetings (SB 399)',
        url: 'https://www.cdflaborlaw.com/blog/what-is-the-current-status-of-the-legality-of-captive-audience-meetings-for-california-employers',
      },
      {
        title: "Ogletree: California employment bills await Governor's signature (Sept 2026)",
        url: 'https://ogletree.com/insights-resources/blog-posts/california-employment-bills-await-governors-signature/',
      },
      {
        title: 'Littler: SB 513 personnel files and training records',
        url: 'https://www.littler.com/news-analysis/asap/california-employers-heads-senate-bill-513-just-changed-rules-personnel-files',
      },
      {
        title: 'Ogletree: New Cal-WARN notice requirements (SB 617)',
        url: 'https://ogletree.com/insights-resources/blog-posts/new-cal-warn-notice-requirements-take-effect-january-1-2026/',
      },
      {
        title: 'EDD: Layoff services and WARN',
        url: 'https://edd.ca.gov/en/jobs_and_training/Layoff_Services_WARN/',
      },
      {
        title: 'EDD: SDI contribution rates and benefit amounts',
        url: 'https://edd.ca.gov/en/disability/Contribution_Rates_and_Benefit_Amounts/',
      },
      {
        title: 'Amundsen Davis: SB 464 pay data penalties guide',
        url: 'https://www.amundsendavislaw.com/labor-employment-law-update/sb-464-guide-californias-new-mandatory-pay-data-penalties-for-2026',
      },
      {
        title: 'Cal/OSHA: Workplace violence prevention for general industry',
        url: 'https://www.dir.ca.gov/dosh/Workplace-Violence/General-Industry.html',
      },
      {
        title: 'Littler: Revised draft general industry workplace violence standard (2026)',
        url: 'https://www.littler.com/news-analysis/asap/california-releases-further-revisions-draft-general-industry-workplace-violence',
      },
      {
        title: 'Title 8 §3396: Heat illness prevention in indoor places of employment',
        url: 'https://www.dir.ca.gov/title8/3396.html',
      },
      {
        title: 'Littler: AB 406 expands paid sick leave and leave reasons',
        url: 'https://www.littler.com/news-analysis/asap/second-consecutive-year-california-expands-reasons-employees-can-use-job',
      },
    ],
  },
  {
    id: 'us-tx',
    name: 'Texas',
    shortName: 'Texas',
    lastVerified: '2026-09',
    file: 'data/country-us-tx.json',
    sources: [
      {
        title: 'Texas Labor Code Ch. 61 (Payday Law)',
        url: 'https://statutes.capitol.texas.gov/Docs/LA/htm/LA.61.htm',
      },
      {
        title: 'Texas Labor Code Ch. 21 (Employment Discrimination / TCHRA)',
        url: 'https://tcss.legis.texas.gov/resources/LA/htm/LA.21.htm',
      },
      {
        title: "Texas Labor Code Ch. 406 (Workers' Compensation coverage)",
        url: 'https://tcss.legis.texas.gov/resources/LA/htm/LA.406.htm',
      },
      {
        title: 'Texas Bus. & Com. Code Ch. 503 (Biometric Identifiers / CUBI)',
        url: 'https://tcss.legis.texas.gov/resources/bc/htm/bc.503.htm',
      },
      {
        title: 'FindLaw: Texas Bus. & Com. Code 15.50 (covenants not to compete)',
        url: 'https://codes.findlaw.com/tx/business-and-commerce-code/bus-com-sect-15-50/',
      },
      {
        title: 'FindLaw: Texas Bus. & Com. Code 521.053 (breach notification)',
        url: 'https://codes.findlaw.com/tx/business-and-commerce-code/bus-com-sect-521-053/',
      },
      {
        title: 'FindLaw: Texas Family Code 158.203 (remitting withheld child support)',
        url: 'https://codes.findlaw.com/tx/family-code/fam-sect-158-203/',
      },
      {
        title: 'Texas OAG: New hire reporting',
        url: 'https://www.texasattorneygeneral.gov/child-support/employers/new-hire-reporting',
      },
      {
        title: 'TDI-DWC Form-005: Employer notice of no coverage',
        url: 'https://www.tdi.texas.gov/forms/dwc/dwc005nocovst.pdf',
      },
      {
        title: 'TDI-DWC Employer FAQ (coverage, DWC-001 and DWC-007 reporting)',
        url: 'https://www.tdi.texas.gov/wc/employer/employerfaq.html',
      },
      {
        title: '28 TAC 110.101: Covered and non-covered employer notices',
        url: 'https://www.law.cornell.edu/regulations/texas/28-Tex-Admin-Code-SS-110-101',
      },
      {
        title: 'Bloomberg Tax: Texas publishes 2026 unemployment insurance tax rates',
        url: 'https://news.bloombergtax.com/payroll/texas-publishes-2026-unemployment-insurance-tax-rates',
      },
      {
        title: 'Littler: Texas Governor signs host of bills impacting employment (2025)',
        url: 'https://www.littler.com/news-analysis/asap/texas-governor-signs-host-bills-impacting-employment',
      },
      {
        title: 'Baker Botts: Texas enacts Responsible AI Governance Act',
        url: 'https://www.bakerbotts.com/thought-leadership/publications/2025/july/texas-enacts-responsible-ai-governance-act-what-companies-need-to-know',
      },
      {
        title: 'K&L Gates: Pared-back TRAIGA signed into law',
        url: 'https://www.klgates.com/Pared-Back-Version-of-the-Texas-Responsible-Artificial-Intelligence-Governance-Act-Signed-Into-Law-6-24-2025',
      },
      {
        title: 'Texas AG: Google $1.375B settlement finalized',
        url: 'https://www.texasattorneygeneral.gov/news/releases/attorney-general-ken-paxton-finalizes-historic-settlement-google-and-secures-1375-billion-big-tech',
      },
      {
        title: "Bracewell: Meta's $1.4B settlement and CUBI obligations",
        url: 'https://www.bracewell.com/resources/billion-dollar-liability-understanding-your-obligations-under-the-texas-capture-or-use-of-biometric-identifier-act/',
      },
      {
        title: 'Fisher Phillips: FAQs on the Texas Data Privacy and Security Act',
        url: 'https://www.fisherphillips.com/en/news-insights/faqs-businesses-texas-data-privacy-law.html',
      },
      {
        title: "Texas Tribune: Texas won't force private companies to use E-Verify (2025)",
        url: 'https://www.texastribune.org/2025/06/05/texas-e-verify-requirements-immigration/',
      },
      {
        title: 'Texas Tribune: Appeals court upholds HB 2127 (Jul 2025)',
        url: 'https://www.texastribune.org/2025/07/18/texas-legislature-death-star-law-city-ordinances-limits/',
      },
      {
        title: 'Epstein Becker Green: HB 2127 and the Texas CROWN Act',
        url: 'https://www.ebglaw.com/workforce-bulletin/legislative-update-texas-limits-local-governments-authority-to-regulate-and-passes-the-crown-act',
      },
      {
        title: 'FTC: Commission accedes to vacatur of Non-Compete Clause Rule (Sept 2025)',
        url: 'https://www.ftc.gov/news-events/news/press-releases/2025/09/federal-trade-commission-files-accede-vacatur-non-compete-clause-rule',
      },
      {
        title: 'Holland & Knight: Fifth Circuit on NLRB removal protections (SpaceX)',
        url: 'https://www.hklaw.com/en/insights/publications/2025/08/fifth-circuit-dual-removal-protections-for-nlrb-aljs-board-members',
      },
      {
        title: 'Office of the Governor: TSIF grant to Arm Inc. (Feb 2026)',
        url: 'https://gov.texas.gov/news/post/governor-abbott-announces-texas-semiconductor-innovation-fund-grant-to-arm-inc',
      },
      {
        title: 'TI: Production begins at Sherman 300mm fab (Dec 2025)',
        url: 'https://www.ti.com/about-ti/newsroom/news-releases/2025/texas-instruments-begins-production-at-its-newest-300mm-semiconductor-manufacturing-facility-in-sherman-texas.html',
      },
    ],
  },
  {
    id: 'us-nc',
    name: 'North Carolina',
    shortName: 'North Carolina',
    lastVerified: '2026-09',
    file: 'data/country-us-nc.json',
    sources: [
      {
        title: 'NCDOR: Individual income tax rate schedules',
        url: 'https://www.ncdor.gov/taxes-forms/individual-income-tax/tax-rate-schedules',
      },
      {
        title: 'Carolina Journal: NC lawmakers unveil long-awaited state budget (income tax path)',
        url: 'https://www.carolinajournal.com/nc-lawmakers-unveil-long-awaited-state-budget/',
      },
      {
        title: 'NCGA: Senate Bill 257 / S.L. 2026-41 (2026 Appropriations Act)',
        url: 'https://www.ncleg.gov/BillLookup/2025/S257',
      },
      {
        title: 'NCGA: G.S. 95-25.13 Notification, posting, and records',
        url: 'https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_95/GS_95-25.13.html',
      },
      {
        title: 'Ogletree: NC modifies pay notice and final wage requirements (S.L. 2021-82)',
        url: 'https://ogletree.com/insights-resources/blog-posts/north-carolina-modifies-requirements-governing-pay-notice-and-final-wages-for-separated-employees/',
      },
      {
        title: 'NCDOL: Changes or reduction in wages',
        url: 'https://www.labor.nc.gov/workplace-rights/employee-rights-regarding-time-worked-and-wages-earned/changes-or-reduction-wages',
      },
      {
        title: 'NCDOL: E-Verify information',
        url: 'https://www.labor.nc.gov/workplace-rights/e-verify/e-verify-information',
      },
      {
        title: "NCGA: House Bill 1214 'Make E-Verify Great Again' (2025-2026)",
        url: 'https://www.ncleg.gov/BillLookup/2025/H1214',
      },
      {
        title: 'Enlace Latino NC: E-Verify bill keeps 25-employee threshold, adds audits and fines',
        url: 'https://enlacelatinonc.org/en/Project-eVerify-eliminates-requirement-for-small-businesses-but-maintains-new-audits-and-fines-for-employers/',
      },
      {
        title: 'NCGA: S.L. 2026-13 (REDA amendments)',
        url: 'https://www.ncleg.gov/EnactedLegislation/SessionLaws/HTML/2025-2026/SL2026-13.html',
      },
      {
        title: "NCGA: S.L. 2026-14 (litigation investments; workers' comp benefits)",
        url: 'https://www.ncleg.gov/EnactedLegislation/SessionLaws/HTML/2025-2026/SL2026-14.html',
      },
      {
        title: 'Ogletree: 2023 NC budget bars local wage payment laws and changes OSH rules',
        url: 'https://ogletree.com/insights-resources/blog-posts/north-carolinas-new-state-budget-makes-changes-to-occupational-safety-and-health-rules-and-bars-local-wage-payment-laws/',
      },
      {
        title: 'NC Industrial Commission: Maximum weekly compensation rates 1982-2026',
        url: 'https://www.ic.nc.gov/workers-compensation-claims/maximum-weekly-compensation-rates',
      },
      {
        title: 'Hedrick Gardner: NC Commission revises Form 19 filing threshold',
        url: 'https://hedrickgardner.com/blog/nc-commission-revises-form-19-froi-filing-requirement/',
      },
      {
        title: 'NC DES: Tax rate information (wage base, new employer rate)',
        url: 'https://www.des.nc.gov/employers/tax-rate-information',
      },
      {
        title: 'NCGA: Senate Bill 757 Consumer Privacy Act (2025-2026)',
        url: 'https://www.ncleg.gov/BillLookup/2025/S757',
      },
      {
        title: 'NC Newsline: House overrides vetoes on anti-DEI and pro-ICE bills (June 2026)',
        url: 'https://ncnewsline.com/2026/06/24/nc-house-republicans-override-gov-steins-vetoes-on-anti-dei-and-pro-ice-bills/',
      },
      {
        title: 'NCGA: House Bill 318 / S.L. 2025-85',
        url: 'https://www.ncleg.gov/BillLookup/2025/H318',
      },
      {
        title: 'Littler: Expiration of state preemption prompts NC local anti-discrimination ordinances',
        url: 'https://www.littler.com/publication-press/publication/expiration-state-preemption-anti-discrimination-ordinances-prompts',
      },
      {
        title: 'Robinson Bradshaw: Workplace violence prevention policies and gun rights laws',
        url: 'https://www.robinsonbradshaw.com/newsroom/publications/Workplace-Violence-Prevention-Policies',
      },
      {
        title: 'NCGA: Senate Bill 445 / S.L. 2026-59 (Regulatory Reform Act of 2026)',
        url: 'https://www.ncleg.gov/BillLookup/2025/S445',
      },
      {
        title: 'Manufacturing Dive: Post-bankruptcy, Wolfspeed receives nearly $700M tax refund',
        url: 'https://www.manufacturingdive.com/news/wolfspeed-receives-700m-tax-refund-chips-act/807037/',
      },
      {
        title: 'Carolina Journal: Wolfspeed layoffs at its Siler City materials factory',
        url: 'https://www.carolinajournal.com/wolfspeed-layoffs-at-its-siler-city-materials-factory/',
      },
      {
        title: 'Commerce Dept: SMART USA CHIPS Manufacturing USA institute headquartered in Durham',
        url: 'https://www.commerce.gov/news/press-releases/2025/01/biden-harris-administration-awards-semiconductor-research-corporation',
      },
      {
        title: 'WFAE: North Carolina companies still waiting for CHIPS Act funding',
        url: 'https://www.wfae.org/2025-06-16/north-carolina-companies-chips-act',
      },
    ],
  },
  {
    id: 'us-co',
    name: 'Colorado',
    shortName: 'Colorado',
    lastVerified: '2026-09',
    file: 'data/country-us-co.json',
    sources: [
      {
        title: 'CDLE INFO #1: 2026 COMPS and PAY CALC Orders',
        url: 'https://cdle.colorado.gov/sites/cdle/files/info_%231_2026_comps_&_paycalc_orders_12.18.25.pdf',
      },
      {
        title: 'CDLE 2026 COMPS Order poster',
        url: 'https://cdle.colorado.gov/sites/cdle/files/2026_comps_order_poster_english_%5Baccessible%5D.pdf',
      },
      {
        title: 'Ogletree: Colorado implements changes to wage and hour rules for 2026',
        url: 'https://ogletree.com/insights-resources/blog-posts/colorado-implements-changes-to-wage-and-hour-rules-for-2026/',
      },
      {
        title: "GovDocs: Colorado's new minimum wage rates for 2026 (state and local)",
        url: 'https://www.govdocs.com/colorados-new-minimum-wage-rates/',
      },
      {
        title: 'Epstein Becker Green: 2026 state non-compete salary thresholds',
        url: 'https://www.ebglaw.com/trade-secrets-employee-mobility/raising-the-cost-of-noncompetes-2026-state-noncompete-salary-threshold-changes',
      },
      {
        title: "Cooley: Colorado's new limitations on restrictive covenants (HB 22-1317)",
        url: 'https://www.cooley.com/news/insight/2022/2022-07-12-colorados-new-limitations-on-restrictive-covenants-take-effect-in-august-2022',
      },
      {
        title: 'Littler: SB 25-083 changes for health-care providers and minority owners',
        url: 'https://www.littler.com/news-analysis/asap/colorado-brings-significant-changes-noncompete-agreements-healthcare-providers',
      },
      {
        title: 'Kutak Rock: Summary of SB 25-083',
        url: 'https://www.kutakrock.com/newspublications/publications/2025/july/summary-of-sb-25-083',
      },
      {
        title: 'CDLE: Equal Pay for Equal Work Act (C.R.S. 8-5-101 et seq.)',
        url: 'https://cdle.colorado.gov/sites/cdle/files/co_equal_pay_for_equal_work_act_%E2%80%9Cepewa%E2%80%9D),_c.r.s_%C2%A7_8-5-101,_et_seq.pdf',
      },
      {
        title: 'Littler: Colorado pay transparency amendments go live 1 Jan 2024',
        url: 'https://www.littler.com/publication-press/publication/colorado-pay-transparency-amendments-go-live-january-1-2024-requiring',
      },
      {
        title: 'CDLE: Job Application Fairness Act (SB 23-058)',
        url: 'https://cdle.colorado.gov/sites/cdle/files/Job%20Application%20Fairness%20Act%20%5Baccessible%5D.pdf',
      },
      {
        title: 'Seyfarth: SB 23-017 changes to the Healthy Families and Workplaces Act',
        url: 'https://www.seyfarth.com/news-insights/if-pain-or-anything-else-yes-gain-part-110-imminent-changes-to-colorados-healthy-families-and-workplaces-act.html',
      },
      {
        title: 'FAMLI Division: Employers (premium rate and filing)',
        url: 'https://famli.colorado.gov/employers',
      },
      {
        title: 'Jackson Lewis: Colorado FAMLI changes for 2026',
        url: 'https://www.jacksonlewis.com/insights/colorado-famli-new-changes-new-year-impact-process-duration-more',
      },
      {
        title: 'Rocky Mountain Employer: FAMLI proposed rule amendments (2027 premium 0.86%)',
        url: 'https://www.rockymountainemployersblog.com/blog/2026/7/30/colorados-famli-division-proposes-amendments-to-six-rules-ahead-of-august-18-2026-hearing',
      },
      {
        title: "Littler: Colorado's POWR Act",
        url: 'https://www.littler.com/publication-press/publication/colorados-powr-act-significantly-expands-workplace-harassment-laws',
      },
      {
        title: 'Greenberg Traurig: 2025 round-up of Colorado employment law',
        url: 'https://www.gtlaw.com/en/insights/2025/12/2025-round-up-major-colorado-employment-law-developments',
      },
      {
        title: "Faegre Drinker: 2026 Colorado employment law: what's new",
        url: 'https://www.faegredrinker.com/en/insights/publications/2026/6/2026-colorado-employment-law-whats-new-whats-next-and-what-to-do-about-it',
      },
      {
        title: "Fisher Phillips: Employer guide to Colorado's newest workplace laws (2026 session)",
        url: 'https://www.fisherphillips.com/en/insights/insights/employer-guide-to-colorados-newest-workplace-laws',
      },
      {
        title: 'McDermott: Colorado AI law replacement bill signed after federal court blocks predecessor',
        url: 'https://www.mcdermottlaw.com/insights/colorado-ai-law-in-flux-comprehensive-replacement-bill-signed-after-federal-court-blocks-predecessors-enforcement/',
      },
      {
        title: "Littler: Implications for employers of Colorado's biometrics law",
        url: 'https://www.littler.com/news-analysis/asap/implications-employers-colorados-new-biometrics-law',
      },
      {
        title: 'CDLE: Employment verification law (affirmation repealed 2016)',
        url: 'https://cdle.colorado.gov/employment-verification-law',
      },
      {
        title: 'Colorado General Assembly: SB 22-161 wage theft penalties',
        url: 'https://leg.colorado.gov/bills/sb22-161',
      },
      {
        title: 'CDLE UI: Premiums and 2026 chargeable wage base',
        url: 'https://cdle.colorado.gov/ui/employers/requirements/premiums',
      },
      {
        title: 'Colorado General Assembly: HB 23-1260 semiconductor incentives',
        url: 'https://leg.colorado.gov/bills/hb23-1260',
      },
    ],
  },
  {
    id: 'us-wa',
    name: 'Washington State',
    shortName: 'Washington',
    lastVerified: '2026-09',
    file: 'data/country-us-wa.json',
    sources: [
      {
        title: 'Foster Garvey: 2026 WA minimum wage, exempt salary and noncompete thresholds',
        url: 'https://www.foster.com/newsroom/legal-alerts/washingtons-minimum-wage-minimum-salary-for-exempt-status-and-noncompete-salary-thresholds-set-to-increase-in-2026/',
      },
      {
        title: 'L&I: Changes to overtime rules (exempt salary threshold)',
        url: 'https://www.lni.wa.gov/workers-rights/wages/overtime/changes-to-overtime-rules',
      },
      {
        title: 'WAC 296-128-545: salary threshold schedule',
        url: 'https://app.leg.wa.gov/wac/default.aspx?cite=296-128-545',
      },
      {
        title: 'L&I: Paid sick leave',
        url: 'https://lni.wa.gov/workers-rights/leave/paid-sick-leave/',
      },
      {
        title: 'ESD: PFML premium rate increases to 1.13% in 2026',
        url: 'https://esd.wa.gov/about-us/news-release/2025/paid-family-medical-leave-premium-rate-increases-113-2026',
      },
      {
        title: 'Paid Leave: Job protection requirements for employers',
        url: 'https://paidleave.wa.gov/job-protection-requirements-for-employers/',
      },
      {
        title: 'Paid Leave: Employer roles and responsibilities',
        url: 'https://paidleave.wa.gov/employer-roles-responsibilities/',
      },
      {
        title: 'Final Bill Report 2SHB 2345 (PFML premium allocation)',
        url: 'https://lawfilesext.leg.wa.gov/biennium/2025-26/Pdf/Bill%20Reports/House/2345-S2%20HBR%20FBR%2026.pdf',
      },
      {
        title: 'WA Cares Fund: toolkit FAQ',
        url: 'https://wacaresfund.wa.gov/toolkit/faq',
      },
      {
        title: 'Littler: WA Cares gets a makeover (2026)',
        url: 'https://www.littler.com/news-analysis/asap/wa-cares-gets-makeover-whats-changing-2026',
      },
      {
        title: 'Final Bill Report ESHB 1155 (noncompete ban)',
        url: 'https://lawfilesext.leg.wa.gov/biennium/2025-26/Pdf/Bill%20Reports/House/1155-S.E%20HBR%20FBR%2026.pdf',
      },
      {
        title:
          'Littler: Washington bans all noncompetes and takes a swipe at TRAPs, clawbacks and forfeitures',
        url: 'https://www.littler.com/news-analysis/asap/washington-bans-all-noncompetes-and-takes-swipe-traps-clawbacks-and-forfeitures',
      },
      {
        title: 'Chapter 49.62 RCW (noncompetition covenants)',
        url: 'https://app.leg.wa.gov/RCW/default.aspx?cite=49.62&full=true',
      },
      {
        title: 'House Bill Report ESSB 5525 (mini-WARN) as enacted',
        url: 'https://lawfilesext.leg.wa.gov/biennium/2025-26/Htm/Bill%20Reports/House/5525-S.E%20HBR%20LAWS%2025.htm',
      },
      {
        title: 'Seyfarth: WA refines mini-WARN (ESB 6106) and UI for layoff volunteers (HB 2264)',
        url: 'https://www.seyfarth.com/news-insights/workforce-reductions-in-washington-lawmakers-refine-miniwarn-requirements-and-broaden-unemployment-benefits-for-layoff-volunteers.html',
      },
      {
        title: 'Ogletree: Governor signs SB 5408 changes to the Equal Pay and Opportunities Act',
        url: 'https://ogletree.com/insights-resources/blog-posts/washington-governor-signs-bill-making-key-changes-to-equal-pay-and-opportunities-act/',
      },
      {
        title: 'Epstein Becker Green: 2026 Washington employment law update',
        url: 'https://www.ebglaw.com/insights/publications/2026-washington-employment-law-update-hiring-restrictions-pay-transparency-leave-and-workplace-safety',
      },
      {
        title: 'Miller Nash: WA employment law mid-year 2026 update',
        url: 'https://www.millernash.com/industry-news/washington-employment-law-update-mid-year-2026-legislative-and-case-law-developments',
      },
      {
        title: 'Chapter 49.94 RCW (Fair Chance Act)',
        url: 'https://app.leg.wa.gov/RCW/default.aspx?cite=49.94&full=true',
      },
      {
        title: 'Final Bill Report 2SHB 2105 (immigrant worker protections)',
        url: 'https://lawfilesext.leg.wa.gov/biennium/2025-26/Pdf/Bill%20Reports/House/2105-S2%20HBR%20FBR%2026.pdf',
      },
      {
        title: 'Seattle OLS: 2026 minimum wage and fine adjustments memo',
        url: 'https://seattle.gov/documents/Departments/LaborStandards/Memo_2026_Seattle_MW_Increase_Jan_update_ADA.pdf',
      },
      {
        title: 'Seattle OLS: PSST updates Q&A (July 2025)',
        url: 'https://www.seattle.gov/documents/departments/laborstandards/qa_psst_updates_07232025.pdf',
      },
      {
        title: 'Seattle: Payroll expense tax',
        url: 'https://www.seattle.gov/city-finance/business-taxes-and-licenses/seattle-taxes/payroll-expense-tax',
      },
      {
        title: 'Seattle: Social Housing Tax',
        url: 'https://seattle.gov/city-finance/business-taxes-and-licenses/seattle-taxes/social-housing-tax',
      },
      {
        title: "WA DOR: New tiered rates for Washington's capital gains tax",
        url: 'https://dor.wa.gov/forms-publications/publications-subject/special-notices/new-tiered-rates-washingtons-capital-gains-tax',
      },
    ],
  },
  {
    id: 'ca',
    name: 'Canada (Federal, Ontario, British Columbia)',
    shortName: 'Canada',
    lastVerified: '2026-09',
    file: 'data/country-ca.json',
    sources: [
      {
        title: 'Littler – New Ontario Job Posting Requirements in Force January 1, 2026',
        url: 'https://www.littler.com/news-analysis/asap/canada-new-ontario-job-posting-requirements-force-january-1-2026',
      },
      {
        title: 'Ontario – Your guide to the ESA: Recent changes',
        url: 'https://www.ontario.ca/document/your-guide-employment-standards-act-0/recent-changes',
      },
      {
        title: 'Ontario – Your guide to the ESA: Termination of employment',
        url: 'https://www.ontario.ca/document/your-guide-employment-standards-act-0/termination-employment',
      },
      {
        title: 'Ontario – Your guide to the ESA: Severance pay',
        url: 'https://www.ontario.ca/document/your-guide-employment-standards-act-0/severance-pay',
      },
      {
        title: 'Ontario – Written policy on electronic monitoring of employees',
        url: 'https://www.ontario.ca/document/your-guide-employment-standards-act-0/written-policy-electronic-monitoring-employees',
      },
      {
        title: 'Ontario – ESA sick leave (medical note prohibition)',
        url: 'https://www.ontario.ca/document/your-guide-employment-standards-act-0/sick-leave',
      },
      {
        title: 'Ontario – Guide to OHSA Part III.0.1: Workplace violence and harassment',
        url: 'https://www.ontario.ca/document/guide-occupational-health-and-safety-act/part-iii0i-workplace-violence-and-workplace-harassment',
      },
      {
        title: 'Hicks Morley – Working for Workers Seven Act, 2025 receives Royal Assent',
        url: 'https://hicksmorley.com/2025/12/02/ontarios-working-for-workers-seven-act-2025-receives-royal-assent/',
      },
      {
        title:
          "Hicks Morley – 'At any time' and 'for any reason' termination clauses survive (Baker, 2026 ONCA 568)",
        url: 'https://hicksmorley.com/2026/08/06/at-any-time-and-for-any-reason-termination-clauses-survive-oca-clarifies-rules-for-interpreting-employment-contracts/',
      },
      {
        title: 'Supreme Court of Canada – Case 41680 (Township of Ignace v. Dufault), leave dismissed',
        url: 'https://www.scc-csc.ca/cases-dossiers/search-recherche/41680/',
      },
      {
        title: 'Hicks Morley – Ontario minimum wage to increase October 1, 2026',
        url: 'https://hicksmorley.com/2026/04/01/ontario-minimum-wage-to-increase-october-1-2026/',
      },
      {
        title: 'McCarthy Tétrault – 2026 AODA compliance deadlines',
        url: 'https://www.mccarthy.ca/en/insights/blogs/canadian-employer-advisor/2026-aoda-compliance-deadlines-what-ontario-employers-need-to-know',
      },
      {
        title: 'Province of BC – Pay transparency in B.C.',
        url: 'https://www2.gov.bc.ca/gov/content/governments/about-the-bc-government/gender-equity/pay-transparency-in-bc',
      },
      {
        title: 'BC Gov News – Third annual Pay Transparency Report (2026)',
        url: 'https://news.gov.bc.ca/releases/2026FIN0022-000633',
      },
      {
        title: 'Province of BC – Quitting or getting fired (CLOS, final pay)',
        url: 'https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/termination/quit-fired',
      },
      {
        title: 'Province of BC – Group Terminations, ESA s.64 (Interpretation Guidelines)',
        url: 'https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/forms-resources/igm/esa-part-8-section-64',
      },
      {
        title: 'Province of BC – ESA and Regulation amendments (2024-2026)',
        url: 'https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/forms-resources/igm/updates',
      },
      {
        title: 'Fasken – BC legislation prohibiting sick notes for short-term absences now in force',
        url: 'https://www.fasken.com/en/knowledge/2025/11/british-columbia-legislation-prohibiting-sick-notes-for-short-term-absences-now-in-force',
      },
      {
        title: 'CRA – CPP contribution rates, maximums and exemptions',
        url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html',
      },
      {
        title: 'CRA – EI premium rates and maximums',
        url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/employment-insurance-ei/ei-premium-rates-maximums.html',
      },
      {
        title: 'Service Canada – How to complete the Record of Employment',
        url: 'https://www.canada.ca/en/employment-social-development/programs/ei/ei-list/reports/roe-guide.html',
      },
      {
        title: 'Competition Bureau – Enforcement guidance on wage-fixing and no-poaching agreements',
        url: 'https://competition-bureau.canada.ca/en/how-we-foster-competition/consultations/enforcement-guidance-wage-fixing-and-no-poaching-agreements',
      },
      {
        title: 'DLA Piper – Canada tables Bill C-36: Protecting Privacy and Consumer Data Act',
        url: 'https://www.dlapiper.com/en/insights/publications/2026/06/canada-tables-bill-c36-the-protecting-privacy-and-consumer-data-act',
      },
      {
        title: 'IRCC – Changes to open work permits for family members of temporary residents',
        url: 'https://www.canada.ca/en/immigration-refugees-citizenship/news/notices/changes-open-work-permits-family-members-temporary-residents.html',
      },
      {
        title: 'Fragomen – Canada 2026-2028 Immigration Levels Plan announced',
        url: 'https://www.fragomen.com/insights/canada-2026-2028-immigration-levels-plan-announced.html',
      },
    ],
  },
  {
    id: 'de',
    name: 'Germany (with EU layer)',
    shortName: 'Germany',
    lastVerified: '2026-09',
    file: 'data/country-de.json',
    sources: [
      {
        title: 'BMAS - Mindestlohn steigt zum 1. Januar 2026 auf 13,90 Euro (and 14,60 Euro in 2027)',
        url: 'https://www.bmas.de/DE/Service/Presse/Pressemitteilungen/2025/mindestlohn-steigt-zum-ersten-januar-2026.html',
      },
      {
        title: 'Bundesregierung - Beitragsbemessungsgrenzen 2026',
        url: 'https://www.bundesregierung.de/breg-de/aktuelles/beitragsgemessungsgrenzen-2386514',
      },
      {
        title: 'Techniker Krankenkasse - Beitragssätze in der Sozialversicherung 2026',
        url: 'https://www.tk.de/firmenkunden/versicherung/beitraege-faq-und-mehr/beitragssaetze/aktuelle-beitragssaetze-in-der-sozialversicherung-2031554',
      },
      {
        title: 'Techniker Krankenkasse - Mindestlohn, Minijobgrenze und Übergangsbereich 2026',
        url: 'https://www.tk.de/firmenkunden/fachthemen/versicherung-fachthema/mindestlohn-2026-minijobs-und-uebergangsbereich-2203074',
      },
      {
        title: 'Bundesagentur für Arbeit - Blaue Karte EU (2026 thresholds)',
        url: 'https://www.arbeitsagentur.de/vor-ort/zav/working-and-living-in-germany/newsletter-iss/03-2026/blaue-karte',
      },
      {
        title: 'Make it in Germany - Opportunity Card (Chancenkarte)',
        url: 'https://www.make-it-in-germany.com/en/visa-residence/types/job-search-opportunity-card',
      },
      {
        title: 'Deutscher Bundestag hib - Umsetzung der EU-Entgelttransparenzrichtlinie (16 Jul 2026)',
        url: 'https://www.bundestag.de/presse/hib/kurzmeldungen-1195086',
      },
      {
        title: 'DLA Piper - German implementation of the Pay Transparency Directive not expected before 2027',
        url: 'https://knowledge.dlapiper.com/dlapiperknowledge/globalemploymentlatestdevelopments/2026/german-implementation-of-the-EU-gender-pay-transparency-directive-legislation-not-expected-before-2027-',
      },
      {
        title: 'KPMG Law - Expert commission recommendations on the Pay Transparency Directive',
        url: 'https://kpmg-law.de/en/implementation-of-the-pay-transparency-directive-what-the-expert-commission-recommends/',
      },
      {
        title: 'European Commission - AI Omnibus enters into force',
        url: 'https://digital-strategy.ec.europa.eu/en/news/ai-omnibus-enters-force',
      },
      {
        title: 'Gibson Dunn - EU AI Act Omnibus agreement: postponed high-risk deadlines',
        url: 'https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/',
      },
      {
        title: 'BMDS - Neues KI-Gesetz (KI-MIG) tritt in Kraft',
        url: 'https://bmds.bund.de/aktuelles/pressemitteilungen/detail/neues-ki-gesetz-tritt-in-kraft',
      },
      {
        title: 'CMS - Fehler im Massenentlassungsverfahren: Kündigungen weiterhin unwirksam',
        url: 'https://cms.law/de/deu/legal-updates/fehler-im-massenentlassungsverfahren-kuendigungen-weiterhin-unwirksam',
      },
      {
        title: 'Energie und Recht - Reform des Arbeitszeitgesetzes 2026: Referentenentwurf',
        url: 'https://www.energieundrecht.com/blog-arbeitsrecht-zivilrecht/arbeitszeitgesetz-reform-2026-referentenentwurf',
      },
      {
        title: 'Gleiss Lutz - Bürokratieentlastungsgesetz IV: Textform ersetzt vielfach Schriftform',
        url: 'https://www.gleisslutz.com/de/know-how/update-bundesrat-beschliesst-buerokratieentlastungsgesetz-textform-ersetzt-kuenftig-vielfach-schriftform',
      },
      {
        title: 'Familienportal - Mutterschutz bei Fehl- und Totgeburten',
        url: 'https://familienportal.de/familienportal/familienleistungen/mutterschutz/welche-regelungen-gelten-bei-fehl-und-totgeburten--125128',
      },
      {
        title: 'BVN - Neue Sätze der Ausgleichsabgabe ab 2026',
        url: 'https://bvn.de/Mitgliederservice/Aktuell/2025/20251217_Schwerbehinderte_Neue_Saetze_Ausgelichsabgabe.php',
      },
      {
        title: 'KPMG Law - BAG zum Paarvergleich (8 AZR 300/24)',
        url: 'https://kpmg-law.de/bag-zum-paarvergleich-wie-arbeitgeber-mit-gehaltsunterschieden-umgehen-sollten/',
      },
      {
        title: 'LTO - BAG zum DSGVO-Schadensersatz bei Betriebsvereinbarung (Workday, 8 AZR 209/21)',
        url: 'https://www.lto.de/recht/nachrichten/n/8azr20921-bag-zum-dsgvo-schadensersatz-bei-betriebsvereinbarung-workday',
      },
      {
        title: 'Covington - EU CSDDD/CSRD Omnibus published in the Official Journal',
        url: 'https://www.cov.com/en/news-and-insights/insights/2026/02/eu-csddd-csrd-omnibus-published-in-official-journal-transposition-delegated-acts-and-guidelines-are-next',
      },
      {
        title: 'Bundesregierung - Lieferkettengesetz: Berichtspflichten entfallen',
        url: 'https://www.bundesregierung.de/breg-de/aktuelles/lieferkettengesetz-2382748',
      },
      {
        title: 'Bundesministerium der Finanzen - FAQ zur Aktivrente',
        url: 'https://www.bundesfinanzministerium.de/Content/DE/FAQ/FAQ-zur-Aktivrente.html',
      },
      {
        title: 'bAVheute - Betriebsrentenstärkungsgesetz II verkündet',
        url: 'https://www.bavheute.de/recht-und-politik/betriebsrentenstaerkungsgesetz-ii-im-bundesgesetzblatt-verkuendet-welche-neuerungen-wann-inkraftreten/',
      },
      {
        title: 'Noerr - Germany expands export controls on emerging technologies (AWV, July 2024)',
        url: 'https://www.noerr.com/en/insights/germany-expands-export-controls-on-emerging-technologies',
      },
      {
        title: 'ESMC - Who we are (Dresden fab facts)',
        url: 'https://www.esmc.eu/en/who_we_are.html',
      },
    ],
  },
  {
    id: 'il',
    name: 'Israel',
    shortName: 'Israel',
    lastVerified: '2026-09',
    file: 'data/country-il.json',
    sources: [
      {
        title: 'National Insurance Institute - Minimum Wage (rates from 1 Apr 2026)',
        url: 'https://www.btl.gov.il/English%20Homepage/Mediniyut/GeneralInformation/Pages/MinimumWage.aspx',
      },
      {
        title: 'National Insurance Institute - Contribution rates for salaried employees (2026)',
        url: 'https://www.btl.gov.il/English%20Homepage/Insurance/Ratesandamount/Pages/forSalaried.aspx',
      },
      {
        title: 'Shibolet - New extension order regarding reservists, spouses and annual leave (2026)',
        url: 'https://www.shibolet.com/en/new-extension-order-regarding-reservists-their-spouses-and-annual-leave-accrual-for-2026-onward/',
      },
      {
        title: 'Arnon, Tadmor-Levy - Extended protections for employees on reserve duty 2025',
        url: 'https://arnontl.com/news/extended-protections-for-employees-on-military-reserve-duty-2025/',
      },
      {
        title: 'Herzog - Rights of reservists and their spouses; families of fallen soldiers (Feb 2025)',
        url: 'https://herzoglaw.co.il/en/news-and-insights/rights-of-reservists-and-their-spouses-protections-for-family-members-of-soldiers-who-fell-in-war/',
      },
      {
        title: 'Lockton - Israel expands employment protections for reservists and spouses (Aug 2024)',
        url: 'https://global.lockton.com/us/en/news-insights/israel-expands-employment-protections-for-reservists-and-their-spouses',
      },
      {
        title: 'Mondaq - Update to the recuperation pay rate for 2026 in the private sector',
        url: 'https://www.mondaq.com/employee-rights-labour-relations/1840890/update-to-the-recuperation-pay-rate-for-2026-in-the-private-sector',
      },
      {
        title: 'Herzog - Labour law year in review 2025, looking ahead to 2026',
        url: 'https://herzoglaw.co.il/en/news-and-insights/labour-law-year-in-review-2025-looking-ahead-to-2026/',
      },
      {
        title: 'Barnea - Employment law: everything you need to know for the beginning of 2025',
        url: 'https://barlaw.co.il/practice_areas/employment/client_updates/employment-law-everything-you-need-to-know-for-the-beginning-of-2025/',
      },
      {
        title: 'Herzog - Israeli employment law privacy update (Amendment 13)',
        url: 'https://herzoglaw.co.il/en/news-and-insights/israeli-employment-law-did-you-know-privacy-update/',
      },
      {
        title: 'Ius Laboris - Major amendment to privacy law in Israel',
        url: 'https://iuslaboris.com/insights/major-amendment-to-privacy-law-in-israel/',
      },
      {
        title: 'Mondaq - Annual privacy review 2025, outlook for 2026',
        url: 'https://www.mondaq.com/privacy-protection/1733296/annual-privacy-review-2025-outlook-for-2026',
      },
      {
        title: 'IAPP - Israeli DPA guidelines on workplace surveillance',
        url: 'https://iapp.org/news/a/israeli-dpa-guidelines-on-workplace-surveillance',
      },
      {
        title: 'Herzog - New and amended Section 102 rules',
        url: 'https://herzoglaw.co.il/en/news-and-insights/new-and-amended-102-rules/',
      },
      {
        title: 'Baker McKenzie Global Equity Matrix - Israel RS/RSU',
        url: 'https://resourcehub.bakermckenzie.com/en/resources/global-equity-matrix/emea/israel/topics/rsrsu',
      },
      {
        title: 'NASPP - Hiring in Israel: how Section 102 shapes equity compensation',
        url: 'https://www.naspp.com/blog/hiring-in-israel--how-section-102-shapes-equity-compensation',
      },
      {
        title: 'PwC Worldwide Tax Summaries - Israel individual taxes on personal income',
        url: 'https://taxsummaries.pwc.com/israel/individual/taxes-on-personal-income',
      },
      {
        title: 'Histadrut - National Labor Court upholds union representation at Nokia Israel',
        url: 'https://global.histadrut.org.il/news/histadrut-secures-major-legal-victory-national-labor-court-upholds-union-representation-at-nokia-israel/',
      },
      {
        title: 'Histadrut - SAP Israel is playing with fire in move against collective agreements',
        url: 'https://global.histadrut.org.il/news/sap-israel-is-playing-with-fire-in-move-against-collective-agreements/',
      },
      {
        title: 'Envoy - Israel minimum prevailing wage for foreign experts increased for 2026',
        url: 'https://www.envoyglobal.com/news-alert/israel-minimum-prevailing-wage-for-foreign-experts-increased-for-2026/',
      },
      {
        title: 'Kan-Tor & Acco - B-1 work visa (expert and HIT tracks)',
        url: 'https://ktalegal.com/practice-areas/israel-immigration/b-1-work-visa/',
      },
      {
        title: 'Kol Zchut - Travel expense reimbursement (Hebrew)',
        url: 'https://www.kolzchut.org.il/he/%D7%94%D7%97%D7%96%D7%A8_%D7%94%D7%95%D7%A6%D7%90%D7%95%D7%AA_%D7%A0%D7%A1%D7%99%D7%A2%D7%94',
      },
      {
        title: 'Kol Zchut - Maternity leave (Hebrew)',
        url: 'https://www.kolzchut.org.il/he/%D7%97%D7%95%D7%A4%D7%A9%D7%AA_%D7%9C%D7%99%D7%93%D7%94',
      },
      {
        title: 'Goldfarb Gross Seligman - Waiver of consideration for service inventions',
        url: 'https://www.goldfarb.com/waiver-of-consideration-for-service-inventions/',
      },
      {
        title: 'Mercer - Israel gender pay gap reporting',
        url: 'https://www.mercer.com/en-us/insights/law-and-policy/israel-to-expand-gender-pay-gap-reporting/',
      },
    ],
  },
  {
    id: 'in',
    name: 'India',
    shortName: 'India',
    lastVerified: '2026-09',
    file: 'data/country-in.json',
    sources: [
      {
        title: 'PIB - Government makes the four Labour Codes effective (21 Nov 2025)',
        url: 'https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=2192463&reg=3&lang=2',
      },
      {
        title: 'KPMG - Government of India notifies final rules on four Labour Codes (May 2026)',
        url: 'https://kpmg.com/xx/en/our-insights/gms-flash-alert/2026/flash-alert-2026-127.html',
      },
      {
        title: 'BDO India - Final central rules notified under all four Labour Codes',
        url: 'https://www.bdo.in/en-gb/insights/alerts-updates/alert-final-central-rules-notified-under-all-four-labour-codes',
      },
      {
        title: "DLA Piper - Key considerations of the notified Central Rules under India's Labour Codes",
        url: 'https://knowledge.dlapiper.com/dlapiperknowledge/globalemploymentlatestdevelopments/2026/Key-considerations-of-the-notified-Central-Rules-under-Indias-Labour-Codes',
      },
      {
        title: 'Cyril Amarchand Mangaldas - A Guide to the New Labour Codes (Dec 2025)',
        url: 'https://www.cyrilshroff.com/wp-content/uploads/2025/12/Guide-to-the-Labour-Codes.pdf',
      },
      {
        title: 'Cyril Amarchand Mangaldas - 60 Days of the Labour Codes (Jan 2026)',
        url: 'https://www.cyrilshroff.com/wp-content/uploads/2026/01/60-days-of-Labour-Codes.pdf',
      },
      {
        title: 'Ministry of Labour & Employment - Additional FAQs on Labour Codes (16 Mar 2026)',
        url: 'https://www.labour.gov.in/static/uploads/2026/03/a4ccf4c6d97c4f1f36a6d83f8c64213d.pdf',
      },
      {
        title: 'LKS - Labour Code Rules: Central & State-wise Status 2026',
        url: 'https://employmentlaw.lkslaw.com/rules',
      },
      {
        title: 'Fisher Phillips - Labor relations in India: 7 steps under the new IR Code (Apr 2026)',
        url: 'https://www.fisherphillips.com/en/insights/insights/labor-relations-in-india-7-steps-employers-should-take-under-new-industrial-relations-code',
      },
      {
        title: 'SCC Online - OSH (Central) Rules 2026 key highlights',
        url: 'https://www.scconline.com/blog/post/2026/05/13/osh-central-rules-2026-key-highlights-and-compliance-guide/',
      },
      {
        title: 'Obhan & Associates - Key compliances under OSH and IR (Central) Rules 2026',
        url: 'https://obhanmason.com/blog/central-rules-notified-key-compliances-under-the-occupational-safety-health-and-working-conditions-central-rules-2026-and-the-industrial-relations-central-rules-2026/',
      },
      {
        title: 'SGCMS - Wage ceiling for supervisors under the Code on Wages (S.O. 454(E), 30 Jan 2026)',
        url: 'https://www.sgcms.com/regulatory-updates/wage-ceiling-for-supervisors-under-the-code-on-wages-2019/',
      },
      {
        title: 'PM India - Cabinet approves EPFO wage ceiling increase to Rs 25,000',
        url: 'https://www.pmindia.gov.in/en/news_updates/cabinet-approves-enhancement-of-epfo-wage-ceiling-from-rs-15000-to-rs-25000-per-month/',
      },
      {
        title: 'Upstox - EPFO wage ceiling hiked to Rs 25,000; gazette notification',
        url: 'https://upstox.com/news/personal-finance/latest-updates/epfo-wage-ceiling-hiked-to-25-000-labour-ministry-issues-gazette-notification/article-200466/',
      },
      {
        title: 'SCC Online - Karnataka Shops and Commercial Establishments (Amendment) Act 2026 explained',
        url: 'https://www.scconline.com/blog/post/2026/09/12/karnataka-shops-and-commercial-establishments-amendment-act-2026-explained/',
      },
      {
        title: 'Deccan Chronicle - Karnataka amends Shops Act, drops certain night-shift safeguards',
        url: 'https://www.deccanchronicle.com/southern-states/karnataka/karnataka-amends-shops-act-drops-certain-night-shift-safeguards-for-women-employees-1986853',
      },
      {
        title: 'Mondaq - Karnataka shops and commercial establishments to operate 24x7 (Sep 2024)',
        url: 'https://www.mondaq.com/india/employee-benefits-compensation/1533326/karnataka-shops-and-commercial-establishments-to-operate-24%C3%977-throughout-the-year',
      },
      {
        title: 'India Briefing - IT/ITES in Karnataka get standing orders exemption till 2029',
        url: 'https://www.india-briefing.com/news/it-ites-companies-karnataka-standing-orders-exemption-till-2029-33321.html/',
      },
      {
        title: 'Peoples Dispatch - Karnataka withdraws plan to increase IT work hours (Aug 2025)',
        url: 'https://peoplesdispatch.org/2025/08/01/worker-resistance-stops-karnataka-governments-plan-to-increase-it-work-hours/',
      },
      {
        title: 'All India Radio - Karnataka puts job quota bill on hold (Jul 2024)',
        url: 'https://www.newsonair.gov.in/karnataka-govt-decided-to-put-on-hold-the-draft-bill-that-ensured-job-quotas-for-kannadigas-in-private-sector',
      },
      {
        title: 'Shardul Amarchand Mangaldas - Enforcement of the DPDP Act and notification of the DPDP Rules',
        url: 'https://www.amsshardul.com/insight/enforcement-of-the-dpdp-act-and-notification-of-the-dpdp-rules/',
      },
      {
        title: 'PIB - Digital Personal Data Protection Rules, 2025',
        url: 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014&reg=3&lang=2',
      },
      {
        title: 'S.S. Rana - MeitY plans to cut short DPDP compliance timeline for SDFs (Feb 2026)',
        url: 'https://ssrana.in/articles/meity-plans-to-cut-short-dpdp-compliance-timeline-and-notify-cross-border-restrictions-for-sdfs/',
      },
      {
        title: 'Income Tax Department - FAQs and guidance notes on forms under Income-tax Rules 2026',
        url: 'https://www.incometaxindia.gov.in/faqs-and-guidance-notes-on-forms-as-per-income-tax-rules-2026',
      },
      {
        title: 'Income Tax Department - FAQs on interplay and transition from ITA 1961 to ITA 2025',
        url: 'https://www.incometaxindia.gov.in/documents/81799/11848482/Updated-FQAs-on-Interplay%26Transitions.pdf/e10ad2b6-9495-de90-58d3-20606d8954ae?t=1775128640970',
      },
    ],
  },
  {
    id: 'tw',
    name: 'Taiwan',
    shortName: 'Taiwan',
    lastVerified: '2026-09',
    file: 'data/country-tw.json',
    sources: [
      {
        title: 'MOL: 2026 minimum wage NT$29,500 / NT$196',
        url: 'https://english.mol.gov.tw/21139/40790/87087/',
      },
      {
        title: 'MOL: 2026 new labor rules overview (勞動新制上路)',
        url: 'https://www.mol.gov.tw/1607/1632/1633/87257/',
      },
      {
        title: 'Executive Yuan: Enhancing parental leave flexibility (2026)',
        url: 'https://english.ey.gov.tw/News3/9E5540D592A5FECD/d16cb288-d088-4bf4-a844-e443c7a9a486',
      },
      {
        title: 'MOL Q&A: flexible parental leave (育嬰留停照顧彈性化)',
        url: 'https://www.mol.gov.tw/1607/28162/28166/28284/28294/84873/post',
      },
      {
        title: 'Bureau of Labor Insurance: parental leave allowance standard (60% + 20%)',
        url: 'https://www.bli.gov.tw/0015727.html',
      },
      {
        title: 'Lee and Li: Amendments to the Regulations of Leaves for Workers (2026)',
        url: 'https://www.leeandli.com/EN/NewslettersDetail/7550.htm',
      },
      {
        title: 'Stellex Law: Practical points on the 2026 leave regulations',
        url: 'https://stellexlaw.com/en/taiwan-worker-leave-regulations-amendment-2026/',
      },
      {
        title: 'Taipei Times: Four new national holidays approved (May 2025)',
        url: 'https://www.taipeitimes.com/News/taiwan/archives/2025/05/09/2003836609',
      },
      {
        title: 'Lee, Tsai & Partners: Act on the Implementation of Commemorative and Festival Holidays',
        url: 'https://www.leetsai.com/taiwan-legislature-passed-the-act-on-the-implementation-of-commemorative-and-festival-holidays-adding-5-national-holidays',
      },
      {
        title: 'Lockton: Taiwan adds new public holidays',
        url: 'https://global.lockton.com/us/en/news-insights/taiwan-adds-a-significant-number-of-new-public-holidays',
      },
      {
        title: 'Baker McKenzie: New workplace bullying laws and employer responses (July 2026)',
        url: 'https://www.bakermckenzie.com/en/insight/publications/2026/07/taiwan-new-workplace-bullying-laws-and-employer-responses',
      },
      {
        title: 'MOL: Workplace bullying prevention subsidiary regulations',
        url: 'https://www.mol.gov.tw/1607/1632/1633/93088/',
      },
      {
        title: 'Taipei Times: Legislature defines workplace bullying, raises penalties',
        url: 'https://www.taipeitimes.com/News/taiwan/archives/2025/12/02/2003848196',
      },
      {
        title: 'Baker McKenzie: Amendment to Personal Data Protection Act (Oct 2025)',
        url: 'https://www.bakermckenzie.com/en/insight/publications/alerts/2025/10/taiwan-amendment-to-personal-data-protection-act',
      },
      {
        title: 'K&L Gates: New developments in the Taiwan PDPA (Jan 2026)',
        url: 'https://www.klgates.com/thought-leadership/New-Developments-in-the-Taiwan-Personal-Data-Protection-Act-1-13-2026',
      },
      {
        title: 'Lee and Li: PDPC draft enforcement rules and three sub-regulations (Feb 2026)',
        url: 'https://www.leeandli.com/TW/NewslettersDetail/7584.htm',
      },
      {
        title: 'NDC: 2025 amendments to the Foreign Professionals Act',
        url: 'https://foreigntalentact.ndc.gov.tw/Content_List.aspx?n=8E20BBA0AFD356E5',
      },
      {
        title: 'KPMG: Draft amendments on tax incentive rules for foreign professionals (2026)',
        url: 'https://kpmg.com/xx/en/our-insights/gms-flash-alert/2026/flash-alert-2026-010.html',
      },
      {
        title: 'NSTC: Core key technologies list pre-announced expansion to 42 items',
        url: 'https://www.nstc.gov.tw/folksonomy/detail/c3cad8e2-cf8b-4fb5-be03-0ace3e433321?l=ch',
      },
      {
        title: 'Executive Yuan Gazette: Amended national core key technologies list (32 items)',
        url: 'https://gazette.nat.gov.tw/EG_FileManager/eguploadpub/eg030246/ch01/type1/gov01/num1/images/Eg01.pdf',
      },
      {
        title: 'Focus Taiwan: Ex-TSMC engineer gets 10-year sentence (Apr 2026)',
        url: 'https://focustaiwan.tw/society/202604270011',
      },
      {
        title: 'CommonWealth: Three engineers indicted in TSMC trade secret case (Aug 2025)',
        url: 'https://english.cw.com.tw/article/article.action?id=4302',
      },
      {
        title: "Rest of World: Taiwan's six-year hunt for China's undercover chip labs",
        url: 'https://restofworld.org/2026/taiwan-china-chip-investigations/',
      },
      {
        title: 'Taipei Times: SMIC probed for allegedly poaching engineers (Mar 2025)',
        url: 'https://www.taipeitimes.com/News/front/archives/2025/03/29/2003834254',
      },
      {
        title: 'Workforce: 2026 labor insurance and pension grade tables',
        url: 'https://twworkforce.com/2025/11/26/2026-labor-insurance/',
      },
    ],
  },
  {
    id: 'cn',
    name: 'China (Mainland)',
    shortName: 'China',
    lastVerified: '2026-09',
    file: 'data/country-cn.json',
    sources: [
      {
        title: 'SPC releases Labor Dispute Judicial Interpretation (II) and typical cases',
        url: 'https://www.court.gov.cn/fabu/xiangqing/472691.html',
      },
      {
        title: "Morgan Lewis - New Interpretations from China's Supreme People's Court",
        url: 'https://www.morganlewis.com/pubs/2025/09/new-interpretations-from-chinas-supreme-peoples-court-what-multinational-employers-need-to-know',
      },
      {
        title: 'DLA Piper - Reinstatement to non-competes under the new SPC Interpretation',
        url: 'https://knowledge.dlapiper.com/dlapiperknowledge/globalemploymentlatestdevelopments/2025/From-reinstatement-to-non-competes-Navigating-post-termination-risks-in-China-under-the-New-Supreme-Court-Interpretation-and-related-guidelines',
      },
      {
        title: 'MOHRSS - Enterprise Non-Compete Compliance Guidelines (gov.cn)',
        url: 'https://www.gov.cn/zhengce/zhengceku/202509/content_7040571.htm',
      },
      {
        title: 'MOHRSS interpretation of the Non-Compete Compliance Guidelines (gov.cn)',
        url: 'https://www.gov.cn/zhengce/202509/content_7040566.htm',
      },
      {
        title: 'CMS - Raise of Statutory Retirement Age of Employees in China',
        url: 'https://cms.law/en/chn/legal-updates/raise-of-statutory-retirement-age-of-employees-in-china',
      },
      {
        title: 'CMS - New regulations implementing the flexible retirement system',
        url: 'https://cms.law/en/chn/news-information/china-releases-new-regulations-for-implementing-its-new-retirement-system',
      },
      {
        title: 'Library of Congress - China adopts decision to gradually raise retirement ages',
        url: 'https://www.loc.gov/item/global-legal-monitor/2024-10-17/china-national-legislature-adopts-decision-to-gradually-raise-retirement-ages/',
      },
      {
        title: 'Morgan Lewis - China Adds Two Days of Paid Statutory Holidays',
        url: 'https://www.morganlewis.com/pubs/2024/11/china-adds-two-days-of-paid-statutory-holidays',
      },
      {
        title: 'MOHRSS notice on monthly average working time and wage conversion (2025)',
        url: 'https://www.gov.cn/zhengce/zhengceku/202501/content_6995777.htm',
      },
      {
        title: 'China Briefing - China 2026 Public Holiday Schedule',
        url: 'https://www.china-briefing.com/news/china-2026-public-holiday-schedule/',
      },
      {
        title: 'Shanghai HRSS - Notice on adjusting Shanghai minimum wage (2025)',
        url: 'https://rsj.sh.gov.cn/tgzfl_17732/20250714/t0035_1434097.html',
      },
      {
        title: 'Shenzhen HRSS - Notice on adjusting Shenzhen minimum wage (2026)',
        url: 'https://hrss.sz.gov.cn/tzgg/content/post_12954870.html',
      },
      {
        title: 'Guandian - Shenzhen minimum wage rises to RMB 2,700 from 1 Sept 2026',
        url: 'https://www.guandian.cn/article/20260814/585100.html',
      },
      {
        title: 'Shanghai HRSS - Interpretation of Shanghai Enterprise Wage Payment Measures (2026)',
        url: 'https://rsj.sh.gov.cn/tzcjd_17352_17352/20260731/t0035_1442849.html',
      },
      {
        title: 'Shanghai HRSS - Normative documents list (2026)',
        url: 'https://rsj.sh.gov.cn/tgwgfx_17726/index.html',
      },
      {
        title: 'AllBright Law - Shanghai sick pay rules after 2026 lapse',
        url: 'https://www.allbrightlaw.com/CN/10475/42bca9a6e17e8184.aspx',
      },
      {
        title: 'Tiansun Law - Recent Shanghai labor and social security rules',
        url: 'https://www.tsunlaw.com/publications/1059',
      },
      {
        title: 'Shanghai 2026 social insurance contribution base limits',
        url: 'https://sh.bendibao.com/shsi/2026818/308504.shtm',
      },
      {
        title: "Seyfarth - Practical insights on China's cross-border data provisions (HR exemption)",
        url: 'https://www.seyfarth.com/news-insights/practical-insights-from-china-on-the-newly-issued-provisions-on-cross-border-data-transfer.html',
      },
      {
        title: 'Morgan Lewis - Measures for the Certification of PI outbound transfers',
        url: 'https://www.morganlewis.com/pubs/2025/10/chinas-data-outbound-rules-update-measures-for-the-certification',
      },
      {
        title: 'Mayer Brown - PI Protection Compliance Audit Measures finalised',
        url: 'https://www.mayerbrown.com/en/insights/publications/2025/04/china-finalises-the-measures-for-personal-information-protection-compliance-audits',
      },
      {
        title: 'DLA Piper Privacy Matters - DPO registration by 29 August 2025',
        url: 'https://privacymatters.dlapiper.com/2025/07/china-dpos-must-be-registered-before-29-august-2025/',
      },
      {
        title: 'Bird & Bird - Using facial recognition technology in China',
        url: 'https://www.twobirds.com/en/insights/2025/china/what-you-need-to-know-when-using-facial-recognition-technology-in-china',
      },
      {
        title: 'Reed Smith - China approves major amendments to Cybersecurity Law',
        url: 'https://www.reedsmith.com/articles/china-approves-major-amendments-to-cybersecurity-law/',
      },
    ],
  },
  {
    id: 'vn',
    name: 'Vietnam',
    shortName: 'Vietnam',
    lastVerified: '2026-09',
    file: 'data/country-vn.json',
    sources: [
      {
        title: 'Baker McKenzie - Vietnam: Change to the Regional Minimum Wage in 2026 (Decree 293/2025)',
        url: 'https://www.bakermckenzie.com/en/insight/publications/2026/03/vietnam-change-to-the-regional-minimum-wage-in-2026',
      },
      {
        title: "Vietnam Briefing - Vietnam's Regional Minimum Wage Effective from January 1, 2026",
        url: 'https://www.vietnam-briefing.com/news/vietnams-new-minimum-wage-january-1-2026.html/',
      },
      {
        title: 'Baker McKenzie - Vietnam: New Decree on Electronic Labor Contract (Decree 337/2025)',
        url: 'https://www.bakermckenzie.com/en/insight/publications/2026/04/vietnam-new-decree-on-electronic-labor-contract',
      },
      {
        title: 'Baker McKenzie - Vietnam: New Work Permit Rules for Foreign Employees (Decree 219/2025)',
        url: 'https://www.bakermckenzie.com/en/insight/publications/alerts/2025/08/vietnam-new-work-permit-rules-for-foreign-employees',
      },
      {
        title: 'EY Vietnam - Decree 219/2025/ND-CP guidance on foreign workers',
        url: 'https://www.ey.com/en_vn/technical/tax/tax-and-law-updates/people-advisory-service-tax-alert-august-2025-decree-2192025ndcp-providing-guidance-on-foreign-workers-working-in-vietnam',
      },
      {
        title: 'Vietnam Briefing - Vietnam Work Permit Regulations: New Rules from August 2025',
        url: 'https://www.vietnam-briefing.com/news/vietnam-work-permit-regulations-for-foreign-workers-from-august-2025.html/',
      },
      {
        title: 'Baker McKenzie - Vietnam: The New Law on Employment 2025',
        url: 'https://www.bakermckenzie.com/en/insight/publications/2026/03/vietnam-the-new-law-on-employment-2025',
      },
      {
        title: 'Alitium - Social Insurance for Foreign Employees in Vietnam: New Rules from July 2025',
        url: 'https://www.alitium.com/social-insurance-for-foreign-employees-in-vietnam-new-rules-from-july-2025/',
      },
      {
        title:
          'Link Compliance - New Social & Health Insurance Contribution Ceiling from 1 July 2026 (Decree 161/2026)',
        url: 'https://www.linkcompliance.com/vietnam-payroll-update-new-social-health-insurance-contribution-ceiling-from-1-july-2026/',
      },
      {
        title: "Vietnam Briefing - Vietnam's New Trade Union Law: Key Changes",
        url: 'https://www.vietnam-briefing.com/news/vietnams-new-trade-union-law-foreign-workers-rights.html/',
      },
      {
        title: 'Vina Bookkeeping - 6 key points of Decree No. 105/2026/ND-CP on trade union fees',
        url: 'https://vinabookkeeping.com/en/decree-no-105-2026-nd-cp-on-trade-union-fees/',
      },
      {
        title: 'DFDL - Vietnam Personal Data Protection 2026: What Foreign Organizations Need to Know',
        url: 'https://www.dfdl.com/insights/legal-and-tax-updates/vietnam-personal-data-protection-2026-what-foreign-organizations-need-to-know/',
      },
      {
        title:
          "Future of Privacy Forum - Making Sense of Vietnam's Latest Data Protection and Governance Regime (Jan 2026)",
        url: 'https://fpf.org/wp-content/uploads/2026/01/January-2026-FPF-Issue-Brief-Making-Sense-of-Vietnams-Latest-Data-Protection-and-Governance-Regime-1.pdf',
      },
      {
        title: 'VNETWORK - Decree 356/2025/ND-CP explained (TIA exemptions, DPO, breach notification)',
        url: 'https://www.vnetwork.vn/en-US/news/nghi-dinh-356-2025-nd-cp/',
      },
      {
        title: 'EY Vietnam - New Personal Income Tax Law 109/2025/QH15',
        url: 'https://www.ey.com/en_vn/technical/tax/tax-and-law-updates/new-personal-income-tax-law-109-2025-qh25',
      },
      {
        title: 'EY Vietnam - Decree 253/2026/ND-CP guidance on the PIT Law',
        url: 'https://www.ey.com/en_vn/technical/tax/tax-and-law-updates/decree-253-2026-nd-cp-providing-guidance-on-the-implementation-of-personal-income-tax-law-109-2025-qh15',
      },
      {
        title: 'Baker McKenzie - Vietnam: Decree, Circular Implementing Personal Income Tax Law (Jul 2026)',
        url: 'https://www.bakermckenzie.com/en/insight/publications/2026/07/vietnam-decree-circular-implementing-personal-income-tax-law',
      },
      {
        title:
          'LuatVietnam - 5-year PIT exemption for high-quality digital technology industry human resources',
        url: 'https://english.luatvietnam.vn/legal-updates/5-year-pit-exemption-for-high-quality-digital-technology-industry-human-resources-892-106625-article.html',
      },
      {
        title:
          'Lockton - Vietnam extends maternity and paternity leave for a second child (Population Law 2025)',
        url: 'https://global.lockton.com/us/en/news-insights/vietnam-extends-maternity-and-paternity-leave-for-employees-welcoming-a-second-child',
      },
      {
        title: 'Government News (baochinhphu.vn) - Vietnamese Culture Day 24/11: workers get a paid day off',
        url: 'https://baochinhphu.vn/ngay-van-hoa-viet-nam-24-11-nguoi-lao-dong-duoc-nghi-lam-huong-nguyen-luong-102260424093821937.htm',
      },
      {
        title: 'Talentnet - Labor Regulations Update June 2026',
        url: 'https://www.talentnetgroup.com/vn/featured-insights/labour-regulations-update/labor-regualtions-updates-june-2026',
      },
      {
        title: 'Talentnet - Labor Regulations Update December 2025 (Decree 318/2025, retirement ages)',
        url: 'https://www.talentnetgroup.com/vn/featured-insights/labour-regulations-update/labor-regulations-update-in-december-2025',
      },
      {
        title: "Allen & Gledhill - Vietnam's new Cybersecurity Law to come into effect 1 July 2026",
        url: 'https://www.allenandgledhill.com/vn/publication/articles/32083/s-new-cybersecurity-law-to-come-into-effect-1-july-2026',
      },
      {
        title:
          'Government News (baochinhphu.vn) - Law amending 4 home-affairs laws (incl. Labor Code) added to 2026 legislative program',
        url: 'https://baochinhphu.vn/bo-sung-du-an-luat-sua-doi-bo-sung-4-luat-thuoc-linh-vuc-noi-vu-vao-chuong-trinh-lap-phap-nam-2026-102260316145215009.htm',
      },
      {
        title: 'eCFR - 15 CFR Part 740 Supplement No. 1 (Country Groups)',
        url: 'https://www.ecfr.gov/current/title-15/subtitle-B/chapter-VII/subchapter-C/part-740/appendix-Supplement%20No.%201%20to%20Part%20740',
      },
    ],
  },
]

export const STATUTORY_CALENDAR: readonly CalendarEntry[] = [
  {
    jurisdiction: 'us',
    month: 1,
    day: 31,
    title: 'W-2/W-3 and 1099-NEC due Jan 31',
    detail:
      'Furnish to employees and file with SSA/IRS by Jan 31. The 2026 W-2s (issued Jan 2027) include the new TT/TP/TA codes. Also due: Form 941 (Q4) and 940 (FUTA) by Jan 31. Jan 1 brings new state minimum wages, exempt thresholds and PFML/UI rates.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us',
    month: 2,
    day: 1,
    title: 'OSHA 300A posting and MA demographic report',
    detail:
      'Post the certified 300A summary from Feb 1 to Apr 30 at each establishment. The MA workforce demographic report (100+ MA employees) is due Feb 1. Employees claiming W-4 exemption must renew by Feb 15.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us',
    month: 3,
    day: 2,
    title: 'OSHA ITA e-submission and 1095-C furnishing (about Mar 2)',
    detail:
      'Submit 300A data (and 300/301 for Appendix B establishments) by Mar 2. Furnish Forms 1095-C by the automatic 30-day extension date (about Mar 2).',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us',
    month: 3,
    day: 31,
    title: 'ACA e-filing due Mar 31',
    detail:
      'File Forms 1094-C/1095-C electronically with the IRS by Mar 31. Some states (CA, NJ, MA, RI, DC) have individual-mandate reporting with different deadlines.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us',
    month: 3,
    title: 'H-1B cap registration (FY+1)',
    detail:
      'The USCIS electronic registration window is usually in March ($215 per registration). The wage-weighted lottery requires the correct OEWS level. Prepare the candidate list in January-February.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us',
    month: 4,
    day: 1,
    title: 'H-1B cap petitions: Apr 1 - Jun 30 window',
    detail:
      'File selected cap petitions within the 90-day window. Check the status of the $100K fee and any new cap fee before filing consular-notification cases.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us',
    month: 6,
    day: 1,
    title: 'RxDC reporting (Jun 1) and historical EEO-1 window',
    detail:
      'Prescription drug data collection for group health plans is due Jun 1. The EEO-1 historically ran May-June; the 2025 collection had not opened as of Sept 2026 and rescission is proposed.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us',
    month: 7,
    day: 31,
    title: 'Form 5500 and PCORI fee due Jul 31',
    detail:
      'Calendar-year plans file Form 5500 by Jul 31 (Form 5558 extends to Oct 15). PCORI fee (Form 720) is due for self-insured plans. Form 941 (Q2) is also due.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us',
    month: 9,
    day: 30,
    title: 'VETS-4212 due Sept 30 (federal contractors)',
    detail:
      'The filing window runs Aug 1 - Sept 30. Also review annual VEVRAA and Section 503 AAPs; EO 11246 AAPs are no longer required.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us',
    month: 10,
    day: 15,
    title: 'H-1B cap start date and Medicare Part D notice',
    detail:
      'H-1B cap employment starts Oct 1 (cap-gap ends). Send the Medicare Part D creditable coverage notice by Oct 15. Extended Form 5500 filings are due Oct 15.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us',
    month: 11,
    title: 'Open enrollment',
    detail:
      "Distribute the SBC and annual notices, set next year's contributions against the ACA affordability percentage, update HSA/FSA/DCAP elections to the new limits, and confirm Roth catch-up coding for employees with prior-year FICA wages over the threshold.",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us',
    month: 12,
    title: 'Year-end compliance refresh',
    detail:
      'Update handbook state addenda, pay ranges, minimum wage and exempt salary changes for Jan 1, new state leave notices, and NY/IL annual harassment training completion. Test payroll for W-2 code readiness.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-ca',
    month: 1,
    day: 1,
    title: 'New laws, minimum wage and exempt thresholds effective',
    detail:
      '1 Jan: state minimum wage ($17.40 in 2027), exempt salary floor ($72,384 in 2027), computer-professional rate update, and many local minimum wages. Update posters, pay scales in postings, and CA offer and agreement templates.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-ca',
    month: 2,
    day: 1,
    title: 'SB 294 notice; Cal/OSHA 300A posting',
    detail:
      'By 1 Feb: annual Workplace Know Your Rights notice to all employees and to any union. Post Form 300A from 1 Feb to 30 Apr.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-ca',
    month: 3,
    day: 2,
    title: 'OSHA ITA upload; FTB health coverage reporting',
    detail:
      '2 Mar: electronic injury data submission where covered. 31 Mar: Forms 1094/1095 to the Franchise Tax Board (self-insured plans).',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-ca',
    month: 4,
    title: 'Pay data preparation',
    detail:
      'Freeze the snapshot-period data, map job categories (23 SOC categories from 2027), check the separately stored demographic data, and prepare the labor-contractor report.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-ca',
    month: 5,
    title: 'CRD pay data report due',
    detail:
      'Due the second Wednesday of May (13 May 2026; 12 May 2027) for employers with 100+ employees and those using 100+ labor-contractor workers.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-ca',
    month: 6,
    title: 'Mid-year leave and PSL audit',
    detail:
      'Check PSL balances on wage statements, CFRA/PDL tracking, and local ordinance rates ahead of July changes.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-ca',
    month: 7,
    day: 1,
    title: 'Local minimum wage changes; WVPP annual review',
    detail:
      '1 Jul: local minimum wage and ordinance changes (e.g., SF, LA, Berkeley). Many employers review their WVPP around its 1 Jul 2024 anniversary; review at least annually and after incidents.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-ca',
    month: 8,
    day: 1,
    title: 'Next-year minimum wage announced',
    detail:
      "By 1 Aug the Department of Finance and DIR announce the next year's minimum wage. Budget exempt salary increases to stay above 2x minimum wage.",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-ca',
    month: 9,
    title: 'Governor bill-signing deadline',
    detail:
      '30 Sep (even years; mid-Oct in odd years): final signatures and vetoes. Start the new-law implementation plan for 1 Jan.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-ca',
    month: 10,
    title: 'Computer professional rate; open enrollment',
    detail:
      "DIR announces the next year's computer-professional exemption rate (usually Oct/Nov). Benefits open enrollment. Check CalSavers exemption status.",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-ca',
    month: 11,
    title: 'Local rate announcements; harassment training cohorts',
    detail:
      'Bay Area cities announce 1 Jan minimum wages. Schedule harassment prevention training for employees whose 2-year cycle ends next year.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-ca',
    month: 12,
    day: 31,
    title: 'Year-end compliance',
    detail:
      'Deliver annual WVPP refresher training, update the CCPA employee notice and retention schedule, finish CPPA risk assessments (existing processing due 31 Dec 2027), and reset PSL for front-load plans.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-tx',
    month: 1,
    day: 31,
    title: 'Q4 UI wage report; Legislature convenes (odd years)',
    detail:
      "31 Jan: TWC quarterly wage report and UI tax payment for Q4. In odd years the Legislature convenes on the second Tuesday of January (12 Jan 2027). Review TWC's new UI tax rate notice and the TRAIGA AI inventory.",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-tx',
    month: 2,
    title: 'Non-subscriber DWC Form-005 window opens; OSHA 300A',
    detail:
      '1 Feb-30 Apr: non-subscribers file DWC Form-005 with TDI-DWC. Post the OSHA 300A from 1 Feb to 30 Apr.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-tx',
    month: 3,
    day: 2,
    title: 'OSHA ITA upload; bill-filing deadline (odd years)',
    detail:
      '2 Mar: OSHA electronic injury data where covered. In odd years, mid-March is the bill-filing deadline, so track employer bills (E-Verify, AI, non-competes).',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-tx',
    month: 4,
    day: 30,
    title: 'DWC Form-005 due; Q1 UI report',
    detail:
      '30 Apr: last day for the non-subscriber annual DWC Form-005 filing and the TWC Q1 wage report and payment.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-tx',
    month: 5,
    title: 'Session ends; storm and flood season',
    detail:
      'In odd years the regular session ends in late May or early June (day 140). Refresh flash-flood and severe-storm procedures for Central Texas sites.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-tx',
    month: 6,
    title: 'Governor veto deadline; ERCOT summer readiness',
    detail:
      'About 20 days after sine die (around 20 June in odd years): final bill signings. Check lab cooling, UPS and heat procedures ahead of ERCOT summer peaks.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-tx',
    month: 7,
    day: 31,
    title: 'Q2 UI report; heat',
    detail: '31 Jul: TWC Q2 wage report. Apply OSHA heat guidance for outdoor and hot-lab work.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-tx',
    month: 9,
    day: 1,
    title: 'New Texas laws effective (odd years)',
    detail:
      '1 Sep: most new Texas statutes take effect in odd years (e.g., SB 835, SB 1318 in 2025). Update the Texas offer letter, handbook addendum and separation templates.',
    recurrence: 'annual',
    oddYears: true,
  },
  {
    jurisdiction: 'us-tx',
    month: 10,
    day: 31,
    title: 'Q3 UI report; open enrollment',
    detail:
      '31 Oct: TWC Q3 wage report. Benefits open enrollment; check insured-plan mandate changes and, for non-subscribers, the injury benefit plan SPD.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-tx',
    month: 11,
    title: 'Winter readiness',
    detail:
      'Test emergency notification, remote-work and lab shutdown procedures for ice storms and ERCOT emergencies; confirm generator and UPS maintenance.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-tx',
    month: 12,
    title: 'Year-end privacy and biometric review; TWC rate notice',
    detail:
      "Purge biometric templates of former employees and log deletions (CUBI), review breach-response contacts, and budget next year's UI tax from TWC's rate notice (typically issued in December).",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-nc',
    month: 1,
    day: 31,
    title: 'Year-start payroll updates; NC-3 and W-2 due',
    detail:
      'Apply the new flat withholding rate (3.49% from 1 Jan 2027), the new DES wage base and the Industrial Commission maximum rate. File the NC-3 annual reconciliation and W-2s with NCDOR, and the Q4 NCUI 101 with DES, by 31 Jan. The long session convenes in odd years (Jan 2027).',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-nc',
    month: 2,
    title: 'OSH 300A posting',
    detail: 'Post the OSH Form 300A summary at each NC establishment from 1 Feb to 30 Apr.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-nc',
    month: 3,
    day: 2,
    title: 'Electronic injury data submission',
    detail:
      'Submit Form 300A data through OSHA ITA by 2 Mar where the establishment is covered (NC state-plan employers follow the same rule; verify).',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-nc',
    month: 4,
    day: 30,
    title: 'DES Q1 report',
    detail: 'File the NCUI 101 quarterly tax and wage report and pay contributions by 30 Apr.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-nc',
    month: 6,
    title: 'Mid-year policy review',
    detail:
      'Review bonus and commission plan changes due 1 Jul and give written notice at least one pay period before any reduction. Check E-Verify case completeness.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-nc',
    month: 7,
    day: 31,
    title: 'Fiscal-year laws effective; DES Q2 report',
    detail:
      "Many session laws take effect 1 Jul (e.g., workers' comp benefit increases from 1 Jul 2027). File the Q2 NCUI 101 by 31 Jul.",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-nc',
    month: 8,
    title: 'Hurricane season readiness',
    detail:
      'Peak season runs Aug-Oct: refresh emergency action plans, closure-pay rules and employee check-in procedures for Triangle sites.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-nc',
    month: 10,
    day: 31,
    title: '1 Oct effective dates; DES Q3 report',
    detail:
      '1 Oct is a common effective date for new NC laws; S.L. 2026-59 firearm course changes take effect 1 Oct 2026. File the Q3 NCUI 101 by 31 Oct.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-nc',
    month: 11,
    title: 'General election; open enrollment',
    detail:
      '3 Nov 2026: vote on the income tax cap amendment. Benefits open enrollment; check insured-plan state continuation language.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-nc',
    month: 12,
    title: 'Year-end PTO and rate notices',
    detail:
      'Make sure written forfeiture notices exist before any year-end PTO forfeiture. Review DES contribution rate notices for the next year and the NC-30 withholding tables. 1 Dec is a common effective date for criminal-law and expunction changes.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-co',
    month: 1,
    day: 1,
    title: 'New rates and laws effective',
    detail:
      '1 Jan: new state and local minimum wages, exempt salary and computer rate, PAY CALC non-compete thresholds, FAMLI premium rate; post the new COMPS poster. 2027: SB 26-189 AI duties begin.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-co',
    month: 1,
    day: 31,
    title: 'FAMLI and UI Q4 filings',
    detail: '31 Jan: FAMLI Q4 wage report and premiums; UI quarterly wage report and premiums.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-co',
    month: 2,
    title: 'FAMLI headcount and OSHA 300A',
    detail:
      'FAMLI employer size is recalculated annually (confirm headcount in the FAMLI portal); post OSHA Form 300A from 1 Feb to 30 Apr.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-co',
    month: 3,
    title: 'Covenant eligibility review',
    detail:
      'After the new PAY CALC threshold, confirm that employees with non-competes or non-solicits still earn at least the threshold; enforcement requires the threshold at the time of enforcement.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-co',
    month: 4,
    day: 30,
    title: 'FAMLI and UI Q1 filings',
    detail: '30 Apr: FAMLI Q1 wage report and premiums; UI Q1 report.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-co',
    month: 5,
    title: 'Legislative session ends',
    detail:
      'The General Assembly adjourns in early May; the governor has 30 days to act. Track signed bills and effective dates (many take effect in early August).',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-co',
    month: 7,
    day: 31,
    title: 'FAMLI and UI Q2 filings; mid-year effective dates',
    detail:
      '31 Jul: FAMLI Q2 wage report and premiums; UI Q2 report. 1 Jul 2027: first Colorado EEO-1 filings due under HB 26-1207 (confirm deadline).',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-co',
    month: 8,
    title: 'New laws without safety clause take effect',
    detail:
      'Bills without a safety clause take effect about 90 days after adjournment (12 Aug in 2026): update handbooks, postings and forms.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-co',
    month: 9,
    day: 1,
    title: 'FAMLI rate for next year; CDLE rule proposals',
    detail:
      "FAMLI director sets next year's premium by 1 Sept; CDLE proposes next year's COMPS and PAY CALC orders in the fall.",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-co',
    month: 10,
    day: 31,
    title: 'FAMLI and UI Q3 filings; election leave',
    detail:
      '31 Oct: FAMLI Q3 wage report and premiums; UI Q3 report. In even years, prepare for paid voting-leave requests before the November election (HB 26-1113).',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-co',
    month: 11,
    title: 'General election and vacation planning',
    detail:
      'Election day (3 Nov 2026) voting leave. Remind managers that year-end vacation forfeiture is not allowed; use accrual caps instead.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-co',
    month: 12,
    title: 'Year-end updates',
    detail:
      'Update Colorado posting ranges, offer letters and non-compete notices for new thresholds; order the new COMPS poster; confirm local minimum wage changes for interns and non-exempt staff.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-wa',
    month: 1,
    day: 1,
    title: 'New rates and thresholds effective',
    detail:
      '1 Jan: state minimum wage, exempt salary floor, computer-professional rate, noncompete earnings thresholds, PFML premium and benefit cap, Seattle and other local minimum wages. Update pay ranges in postings, HRIS exempt flags and WA offer templates.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-wa',
    month: 1,
    day: 31,
    title: 'Quarterly ESD and L&I reports; Seattle payroll tax',
    detail:
      "31 Jan: Q4 UI/PFML/WA Cares wage-and-hour reports to ESD and the workers' comp hours report to L&I. Seattle payroll expense tax and Social Housing Tax Q4 return.",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-wa',
    month: 2,
    title: 'Injury log summary posting',
    detail:
      'Post the annual summary of work-related injuries and illnesses (WAC 296-27) from 1 Feb to 30 Apr.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-wa',
    month: 3,
    title: 'Legislative session ends',
    detail:
      'The session ends in March (even years, 60 days) or April (odd years, 105 days). Most new laws take effect 90 days after adjournment (June or July). Run a bill-impact review.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-wa',
    month: 4,
    day: 15,
    title: 'Capital gains tax return; Q1 filings',
    detail:
      '15 April: WA capital gains tax return and payment for equity holders (communicate to RSU and ESPP participants). 30 April: Q1 ESD, L&I and Seattle payroll tax filings.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-wa',
    month: 6,
    title: 'Mid-year effective dates',
    detail:
      'New session laws usually take effect in June or July (11 June 2026; around late July in odd years). Refresh policies, posters and agreement templates.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-wa',
    month: 6,
    title: 'Noncompete ban effective (2027)',
    detail:
      '30 June 2027: all noncompetes void. Stop enforcing and remove them from WA agreements and equity award terms by then.',
    recurrence: 'annual',
    years: [2027],
  },
  {
    jurisdiction: 'us-wa',
    month: 7,
    title: 'UI benefit amounts and Q2 filings',
    detail:
      'UI maximum and minimum weekly benefits change the first Sunday of July. 31 July: Q2 ESD, L&I and Seattle filings. The EPOA cure period ends 27 July 2027.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-wa',
    month: 9,
    day: 30,
    title: 'Minimum wage announcement',
    detail:
      "By 30 Sept, L&I publishes next year's minimum wage, and with it the exempt salary floor and computer-professional rate. Seattle OLS publishes the Seattle rate around the same time.",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-wa',
    month: 10,
    day: 31,
    title: 'Q3 filings and noncompete notices',
    detail:
      '31 Oct: Q3 ESD, L&I and Seattle filings. 1 Oct 2027: deadline for notices that noncompetes are void (ESHB 1155). HB 2105 I-9 notice duties began 1 Oct 2026.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-wa',
    month: 11,
    title: 'PFML rate announcement and open enrollment',
    detail:
      "ESD announces next year's PFML premium and split (by mid-November). Update payroll and open-enrollment materials. Verify WA Cares exemption lists, including temporary visa holders.",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'us-wa',
    month: 12,
    title: 'Year-end leave and threshold review',
    detail:
      'Confirm PSL carryover (40 hours state; Seattle Tier 3 up to 72/108 hours), the PFML employer size for job protection in the next year, exempt salaries against the new floor, and Seattle payroll-tax thresholds.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'ca',
    month: 1,
    day: 1,
    title: 'Jan 1 headcount snapshot and rate changes',
    detail:
      'Count ON employees: 25+ triggers the disconnecting and e-monitoring policies (due Mar 1) plus the job-posting and new-hire information rules. Count BC employees for pay transparency reporting (as at Jan 1). New CPP/CPP2/EI and tax tables apply to the first payroll.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'ca',
    month: 1,
    title: 'Annual review of harassment, violence and OHS policies',
    detail:
      'ON OHSA requires violence/harassment policies and the OHS policy to be reviewed at least annually. WorkSafeBC expects an annual review of bullying and harassment policies and procedures. Record the review date.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'ca',
    month: 1,
    title: 'Recurring: ROE deadlines (every pay period)',
    detail:
      'Electronic ROE within 5 calendar days after the end of the pay period with an interruption of earnings (leave, termination, layoff). Monthly payrolls: the earlier of that date or 15 days after the interruption.',
    recurrence: 'monthly',
  },
  {
    jurisdiction: 'ca',
    month: 2,
    title: 'T4/T4A slips and summary due',
    detail:
      'File with the CRA and give to employees by the last day of February (the next business day if it falls on a weekend). Electronic filing is required above 5 slips. RL-1 slips for Quebec employees. Family Day falls on the 3rd Monday (ON and BC).',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'ca',
    month: 3,
    day: 1,
    title: 'Ontario policy deadline: March 1',
    detail:
      'Disconnecting-from-work and electronic-monitoring policies must be in place if there were 25+ ON employees on Jan 1. Distribute within 30 days and keep for 3 years.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'ca',
    month: 3,
    title: 'RRSP contribution deadline',
    detail:
      'The deadline for prior-year RRSP deductions is the 60th day of the year (about Mar 1-2). Ensure group RRSP and DPSP contributions are remitted and year-end matching is trued up.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'ca',
    month: 6,
    day: 30,
    title: 'BC minimum wage adjustment and T2/SR&ED timing',
    detail:
      'BC minimum wage changes June 1 (C$18.25 in 2026). For a Dec 31 year-end, the T2 is due June 30. The SR&ED claim (T661) is due 18 months after the tax year-end, so gather engineering time records now.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'ca',
    month: 9,
    day: 30,
    title: 'National Day for Truth and Reconciliation (Sept 30)',
    detail:
      'Statutory holiday in BC (not in ON for provincially regulated employers). Plan coverage and communications. Labour Day falls on the 1st Monday.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'ca',
    month: 10,
    title: 'Ontario minimum wage adjustment',
    detail:
      'ON minimum wage rises Oct 1 (to C$17.95 in 2026; student C$16.90). Update intern and co-op rates and pay-range floors. Thanksgiving is the 2nd Monday (ON and BC).',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'ca',
    month: 11,
    day: 1,
    title: 'BC Pay Transparency Report due Nov 1',
    detail:
      'Employers with 50+ BC employees (from 2026) publish the report on their website or in the workplace by Nov 1, using prior-calendar-year data. Remembrance Day (Nov 11) is a BC statutory holiday.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'ca',
    month: 12,
    day: 31,
    title: 'AODA accessibility compliance report (Dec 31, 2026)',
    detail:
      'Private-sector organizations with 20+ ON employees file the online compliance report every 3 years (next after 2026: 2029). Also refresh the multi-year accessibility plan and confirm AODA training records.',
    recurrence: 'annual',
    years: [2026, 2029, 2032],
  },
  {
    jurisdiction: 'ca',
    month: 12,
    title: 'Year-end payroll and poster checks',
    detail:
      'Reconcile taxable benefits and equity income for T4s. Confirm the ESA poster version (ON) and required OHSA postings. Review vacation carryover under the ON 10-month and BC 12-month taking rules. Plan Jan 1 policy updates for the Working for Workers changes.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'de',
    month: 1,
    title: 'New-year rates and forfeiture notices',
    detail:
      'Load 2027 minimum wage (EUR 14.60), mini-job ceiling (EUR 633), new social insurance ceilings, insurer additional rates and Blue Card thresholds; send individual leave-status and forfeiture notices early in the year.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'de',
    month: 1,
    title: 'Monthly: payroll remittances',
    detail:
      'Every month: wage tax return and payment by the 10th; social insurance contributions due on the third-last banking day (contribution statement 2 working days earlier).',
    recurrence: 'monthly',
  },
  {
    jurisdiction: 'de',
    month: 2,
    day: 15,
    title: 'Annual payroll reports',
    detail:
      'DEÜV annual reports to health insurers by 15 Feb; digital annual payroll report to the Berufsgenossenschaft (UV-Jahresmeldung) by 16 Feb; electronic Lohnsteuerbescheinigungen by the last day of February.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'de',
    month: 3,
    day: 31,
    title: 'Severely disabled report and levy',
    detail:
      'By 31 Mar file the prior-year employment report with the Agentur für Arbeit (via REHADAT-Elan) and pay any Ausgleichsabgabe to the Integrationsamt (ZBFS Bavaria / KSV Saxony).',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'de',
    month: 3,
    title: 'Carried-over leave lapses',
    detail:
      'Leave carried over from the prior year lapses on 31 Mar, but only where the employer gave compliant forfeiture notices.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'de',
    month: 3,
    title: 'Works council election window (every 4 years)',
    detail:
      'Regular elections run 1 Mar-31 May (2026, next 2030); new councils can be elected at any time outside this window.',
    recurrence: 'annual',
    years: [2026, 2030, 2034],
  },
  {
    jurisdiction: 'de',
    month: 3,
    title: 'Quarterly: safety committee and works meetings',
    detail:
      'Hold the occupational safety committee each quarter (more than 20 employees) and support the quarterly works meeting, where the employer reports at least annually on personnel, social, equality and economic matters (§43(2) BetrVG).',
    recurrence: 'quarterly',
  },
  {
    jurisdiction: 'de',
    month: 6,
    day: 7,
    title: 'EU pay transparency milestones',
    detail:
      "7 Jun 2026 transposition deadline passed; the Directive's first reports are due 7 Jun 2027 for 150+ employees (German dates pending). The Minimum Wage Commission decides by 30 Jun in odd years.",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'de',
    month: 8,
    title: 'AI Act milestones',
    detail:
      '2 Aug 2026: Art. 50 transparency duties apply (watermarking grace to 2 Dec 2026); 2 Dec 2027: Annex III high-risk employment systems.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'de',
    month: 10,
    title: 'Saxony holidays and year-end planning',
    detail:
      'Reformation Day (31 Oct) and Buß- und Bettag (November Wednesday) are holidays in Dresden; plan Q4 leave usage and send reminder forfeiture notices.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'de',
    month: 11,
    title: 'Health insurer and budget updates',
    detail:
      'Insurers announce additional contribution rates for January (employees have a special termination right on increases); finalise next-year bonus targets before year-start to avoid late-target damages claims.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'de',
    month: 12,
    title: 'Year-end payroll and HinSchG/works council reviews',
    detail:
      'Year-end payroll close, holiday calendar publication for Bavaria and Saxony, review of whistleblowing channel statistics and deletion of case files older than 3 years after closure.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'il',
    month: 1,
    title: 'Every month: payroll, withholding and pension deposits',
    detail:
      'Pay salaries by the 9th. File Form 102 and pay tax/NII withholding by the 15th. Deposit pension, severance and study-fund contributions and report through the clearing house by the regulatory deadline (verify).',
    recurrence: 'monthly',
  },
  {
    jurisdiction: 'il',
    month: 1,
    title: 'New year payroll parameters and Form 101',
    detail:
      'Apply the new NII thresholds and ceiling, the tax parameters and the foreign-expert minimum salary (NIS 27,132 from 1 Jan 2026), and collect updated Form 101 from every employee.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'il',
    month: 1,
    title: 'Reserve-duty year reset',
    detail:
      "Cumulative reserve-day counts for dismissal protection and spouse leave generally reset each calendar year under the extension orders. Confirm the new year's order and update trackers.",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'il',
    month: 3,
    title: 'Form 106 to employees',
    detail:
      'Issue annual payroll statements (Form 106) for the prior tax year by the end of March (verify the deadline).',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'il',
    month: 4,
    day: 30,
    title: 'Minimum wage update, Section 102 annual report, Form 126',
    detail:
      "The minimum wage changes on 1 Apr. The Section 102 annual equity report is due 30 Apr. File the employer's annual withholding report (Form 126) by its deadline (verify).",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'il',
    month: 4,
    title: 'Pesach and Independence Day',
    detail:
      'Pesach (first and seventh days) and Independence Day fall in Mar-May. Publish closure plans and remember holiday pay for hourly staff.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'il',
    month: 6,
    day: 1,
    title: 'Gender pay-gap report',
    detail:
      'Employers with more than 518 Israeli employees prepare the annual gender pay-gap report (commonly due by 1 Jun; verify) and share it with employees.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'il',
    month: 6,
    title: 'Convalescence pay',
    detail:
      'Most private employers pay convalescence in June-July for the recuperation year. For 2026, pay the differences at NIS 451.50/day after the August 2026 update.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'il',
    month: 7,
    title: 'Section 102 quarterly report',
    detail:
      'Quarterly equity award reports are due within 120 days of quarter-end: about 29 Jul (Q1), 28 Oct (Q2), 28 Jan (Q3) and 30 Apr (Q4) (verify the exact dates).',
    recurrence: 'quarterly',
  },
  {
    jurisdiction: 'il',
    month: 9,
    title: 'High Holidays',
    detail:
      'Rosh Hashanah, Yom Kippur, Sukkot and Simchat Torah fall in Sep-Oct. Plan permits for any essential Shabbat or holiday work, confirm the holiday choices of non-Jewish employees, and handle reduced hours on holiday eves under company practice.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'il',
    month: 10,
    title: 'Knesset election day (2026)',
    detail:
      'Election day is a paid rest day. Elections are due by late Oct 2026 (verify the date). Employees required to work get special pay under the elections law.',
    recurrence: 'annual',
    years: [2026],
  },
  {
    jurisdiction: 'il',
    month: 12,
    title: 'Leave and attendance year-end',
    detail:
      'Review leave balances against the carry-over rules and reservist carry-forward rights, reconcile global overtime against recorded hours, and refresh sexual-harassment and privacy training.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'in',
    month: 1,
    day: 15,
    title: 'Labour Welfare Fund contributions',
    detail:
      'Karnataka LWF (INR 20 employee + INR 40 employer per employee) due 15 Jan for the prior calendar year. Telangana LWF (INR 2 + INR 5) due 31 Jan (verify current rates).',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'in',
    month: 1,
    day: 31,
    title: 'POSH annual report to District Officer',
    detail:
      "The IC's calendar-year annual report goes to the employer and the District Officer (Bengaluru Urban / Hyderabad). Commonly filed by 31 Jan (confirm local practice). Figures also feed the board's report disclosures.",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'in',
    month: 1,
    day: 31,
    title: 'Q3 TDS return and annual labour returns',
    detail:
      'Form 138 (formerly 24Q) for Oct-Dec due 31 Jan. Prepare the annual returns under the Labour Codes and state rules (unified electronic returns; verify Karnataka/Telangana due dates when final rules issue).',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'in',
    month: 1,
    title: 'Monthly (every month): statutory payroll deposits',
    detail:
      'Salaries by the 7th. TDS deposit by the 7th (30 Apr for March). PF and ESI contributions and returns by the 15th. Karnataka PT by the 20th and Telangana PT by the 10th.',
    recurrence: 'monthly',
  },
  {
    jurisdiction: 'in',
    month: 2,
    title: 'Karnataka PT top-up and tax proofs',
    detail:
      'Deduct INR 300 of Karnataka PT in February to reach the INR 2,500 annual cap. Collect Form 124 (formerly 12BB) investment proofs from old-regime employees.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'in',
    month: 3,
    title: 'Year-end payroll and gratuity valuation',
    detail:
      'Final TDS true-up, gratuity and leave actuarial valuation (reflecting the Code wages base), and renewal of gratuity trust or insurance funding.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'in',
    month: 4,
    title: 'New tax year and regime choice',
    detail:
      'Tax year starts 1 Apr: collect regime elections and declarations. Renew or pay the employer PT enrolment where applicable (verify the Karnataka due date). Revise salary structures against the 50% rule in the annual cycle.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'in',
    month: 5,
    day: 31,
    title: 'Q4 TDS return',
    detail: 'Form 138 for Jan-Mar due 31 May.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'in',
    month: 6,
    day: 15,
    title: 'Issue Form 130 (formerly Form 16)',
    detail:
      'Issue salary TDS certificates by 15 Jun. For FY 2025-26, the old-Act Form 16 was issued in June 2026.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'in',
    month: 7,
    day: 31,
    title: 'Q1 TDS return; employee ITR season',
    detail: 'Form 138 for Apr-Jun due 31 Jul. Remind employees to disclose foreign RSUs/ESPP in Schedule FA.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'in',
    month: 10,
    day: 31,
    title: 'Q2 TDS return',
    detail: 'Form 138 for Jul-Sep due 31 Oct.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'in',
    month: 11,
    day: 30,
    title: 'Statutory bonus deadline; DPDP consent-manager phase',
    detail:
      'Pay statutory bonus by 30 Nov (8 months after a March year end). DPDP consent-manager provisions start 13 Nov 2026, and May 2027 readiness should be on track.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'in',
    month: 12,
    title: 'Leave year-end and holiday list',
    detail:
      "Apply the 30-day carry-forward for workers and encash the excess. Finalise and display next year's national and festival holiday list (Karnataka: 5 mandatory + 5 festival). Refresh POSH training and IC member terms.",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'tw',
    month: 1,
    day: 31,
    title: 'Withholding statements and NHI supplementary premium filing',
    detail:
      "File the prior year's income tax withholding and supplementary premium statements with the tax authority by 31 January (next business day if it falls on a holiday). Issue statements to employees by 10 February.",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'tw',
    month: 1,
    title: 'New minimum wage and insurance grades',
    detail:
      'Apply the new minimum wage (NT$29,500/NT$196 for 2026) and updated Labor Insurance, NHI and pension grade tables from 1 January. Re-grade affected employees.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'tw',
    month: 1,
    title: 'Annual leave settlement (calendar-year schemes)',
    detail:
      'Pay out unused prior-year annual leave (unless deferral was agreed) by the regular payday or within 30 days of year-end, and give the written annual leave statement.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'tw',
    month: 2,
    title: 'Year-end (Lunar New Year) bonuses',
    detail:
      'Pay year-end bonuses before the Lunar New Year holiday (late January to February). Check the LSA Art. 29 profit-bonus duty and apply 2.11% NHI supplementary premium withholding on large bonuses.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'tw',
    month: 3,
    day: 31,
    title: 'Q1 labor-management meeting; old-system pension top-up',
    detail:
      'Hold the quarterly labor-management meeting. If any employees keep old-system seniority, top up the pension reserve shortfall by 31 March.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'tw',
    month: 5,
    title: 'Individual income tax filing',
    detail:
      'Annual individual income tax filing runs 1-31 May. Foreign professionals claim the special tax incentive with their filing. Labor Day (May 1) is a paid holiday.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'tw',
    month: 6,
    title: 'Q2 labor-management meeting; Dragon Boat Festival',
    detail:
      'Hold the quarterly meeting (approve or renew overtime and flexible-hours consents as needed). Dragon Boat Festival holiday and customary festival bonus or gift (the date moves with the lunar calendar).',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'tw',
    month: 7,
    title: 'Anniversary of bullying rules; mid-year compliance check',
    detail:
      'Review workplace bullying (effective 1 July 2026) and sexual harassment case logs, training completion and complaint-channel postings.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'tw',
    month: 9,
    title: "Minimum wage decision; Q3 meeting; Mid-Autumn and Teachers' Day",
    detail:
      "Budget for the minimum wage decided in Q3. Hold the Q3 labor-management meeting. Mid-Autumn Festival (lunar date) and Teachers' Day (Sept 28) are paid holidays.",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'tw',
    month: 10,
    title: 'National Day and Retrocession Day',
    detail:
      'Paid holidays on Oct 10 and Oct 25, with make-up days if they fall on a regular day off or rest day.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'tw',
    month: 11,
    title: 'Next-year insurance and pension grade tables',
    detail:
      "MOL and NHIA publish next year's insured salary and contribution grade tables. Update payroll configuration.",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'tw',
    month: 12,
    title: 'Year-end leave, bonus and Q4 meeting',
    detail:
      "Constitution Day (Dec 25) holiday. Hold the Q4 labor-management meeting, confirm annual leave balances and deferrals, finalize year-end bonus and employee-compensation resolutions, and publish next year's holiday calendar (16 days).",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'tw',
    month: 12,
    title: 'Annual health check and OSH plan review',
    detail:
      'Schedule periodic health exams and review the workplace violence, overwork, musculoskeletal and maternal health plans and records for the coming year.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'cn',
    month: 1,
    title: 'Annual leave reset and prior-year settlement',
    detail:
      'Pay 300% for untaken prior-year leave not carried over by agreement; reset entitlements; IIT cumulative withholding restarts.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'cn',
    month: 1,
    title: 'Union funds (2%)',
    detail:
      'Declared monthly/quarterly with tax filings; confirm local collection practice (union funds or preparatory funds where no union) - verify.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'cn',
    month: 2,
    title: 'Spring Festival and year-end bonus',
    detail:
      'Apply State Council schedule and swapped workdays; decide per employee whether to use separate annual-bonus taxation (available through 2027).',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'cn',
    month: 3,
    title: 'IIT annual reconciliation opens',
    detail:
      'Employees file 1 Mar - 30 Jun via the Individual Income Tax app; employer supports data queries and may file on behalf where authorized.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'cn',
    month: 4,
    title: 'SAFE equity plan quarterly filing',
    detail:
      'Domestic agent files quarterly equity-plan participation/FX report with SAFE early each quarter (also Jul, Oct, Jan) - verify local deadline.',
    recurrence: 'quarterly',
  },
  {
    jurisdiction: 'cn',
    month: 6,
    day: 30,
    title: 'IIT reconciliation closes and annual reports',
    detail:
      'IIT reconciliation deadline 30 Jun; WFOE annual report to SAMR (incl. social insurance data) due 30 Jun; Shenzhen employers declare new SI/HF bases by end-June.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'cn',
    month: 6,
    title: 'High-temperature allowance season',
    detail: 'Shanghai June-Sept, Guangdong June-Oct for eligible outdoor/non-cooled roles.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'cn',
    month: 7,
    title: 'Social insurance and housing fund base reset',
    detail:
      'New contribution year starts 1 Jul in Shanghai and many cities; update payroll caps/floors and housing fund base.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'cn',
    month: 9,
    day: 30,
    title: 'Base top-up deadline and Guangdong minimum wage',
    detail:
      'Shanghai 2026 retroactive SI top-ups due by 30 Sept; Shenzhen minimum wage RMB 2,700 effective 1 Sept 2026.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'cn',
    month: 10,
    title: 'National Day holiday',
    detail: 'Apply swapped workdays; holiday work at 300%.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'cn',
    month: 11,
    title: "Next year's holiday schedule",
    detail:
      "State Council typically publishes the following year's schedule in Nov; update HRIS calendars and shift plans.",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'cn',
    month: 12,
    title: 'Year-end compliance sweep',
    detail:
      'Ensure annual leave is taken or carried over by agreement; adopt handbook changes via democratic procedure before 1 Jan; track expiring contracts and second fixed terms (open-ended triggers).',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'vn',
    month: 1,
    title: 'Monthly (every month): SI, HI, UI and union fee',
    detail:
      'Remit SI/HI/UI contributions and the 2% union fee by the last day of the following month; file PIT withholding returns monthly (by the 20th) or quarterly (by the last day of the month after the quarter) as applicable (verify 2026 cadence).',
    recurrence: 'monthly',
  },
  {
    jurisdiction: 'vn',
    month: 1,
    title: 'New regional minimum wage and annual resets',
    detail:
      'Apply any new regional minimum wage from 1 January, re-run UI caps and check contract salaries; start the annual health-check cycle if run in Q1.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'vn',
    month: 1,
    title: 'Tet bonus and Tet holiday',
    detail:
      'Pay the 13th-month or Tet bonus before Tet (Tet 2027 falls on 6 Feb 2027) and publish the chosen Tet holiday days in advance; expect a resignation wave after the payout.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'vn',
    month: 3,
    day: 31,
    title: 'Employer PIT finalization',
    detail:
      "File the employer's annual PIT finalization (including for employees who authorized it) by 31 March; issue withholding certificates.",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'vn',
    month: 4,
    day: 30,
    title: 'Individual PIT finalization; spring holidays',
    detail:
      'Employees self-filing finalize by 30 April. Hung Kings Day (10th day of the 3rd lunar month), 30 April and 1 May holidays.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'vn',
    month: 6,
    day: 5,
    title: 'Half-year labour usage report',
    detail:
      'Report labour usage changes for the first half-year (by 5 June under Decree 145; verify whether replaced by Employment Law 2025 labour registration).',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'vn',
    month: 7,
    title: 'Base salary and SI cap changes',
    detail:
      'Reference-level changes usually take effect 1 July (VND 2.53m and a VND 50.6m SI/HI cap from 1 Jul 2026); update caps, childbirth allowance and union dues ceilings. Half-year OSH and accident statistics are due in early July (verify).',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'vn',
    month: 8,
    title: 'National Day holiday planning',
    detail:
      "Announce the National Day arrangement (2 Sep plus 1 adjacent day); the National Wage Council typically debates next year's minimum wage around this time.",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'vn',
    month: 9,
    title: 'PDPL assessment refresh',
    detail:
      'Review DPIA and TIA dossiers at least every 6 months for regulated changes (new HR systems, vendors, AI tools) and refile updates with the Ministry of Public Security.',
    recurrence: 'annual',
  },
  {
    jurisdiction: 'vn',
    month: 11,
    title: 'Vietnamese Culture Day and next-year planning',
    detail:
      "24 November paid holiday (from 2026). Announce the next year's holiday schedule, including Tet choices, and watch for the minimum-wage decree for 1 January.",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'vn',
    month: 12,
    day: 5,
    title: 'Year-end labour and tax deadlines',
    detail:
      "Annual labour usage report (by 5 December under Decree 145; verify), dependant registration deadline for PIT (31 December), next year's annual leave schedule, and the annual workplace dialogue and employee conference if not yet held.",
    recurrence: 'annual',
  },
  {
    jurisdiction: 'vn',
    month: 12,
    title: 'Work permit and contract expiry sweep',
    detail:
      'Review definite-term contracts expiring in the next quarter (second definite-term contract must be followed by an indefinite one) and work permits expiring in the next 60 days (renewal once, filed 10-45 days before expiry; verify window).',
    recurrence: 'annual',
  },
]
