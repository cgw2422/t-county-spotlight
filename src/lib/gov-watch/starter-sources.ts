/**
 * Starter list of Tuscarawas County government sources (loaded once from Admin → Government Watch → Sources).
 *
 * Researched with web search only: the research environment could not open the government websites, so EVERY
 * entry is marked "needs review". Values are only those that appeared in search results (never constructed or
 * guessed); unknown fields are null. Notes say what is uncertain and `evidence` lists where each came from.
 * Verify each source (open its site, confirm the minutes/agendas pages and clerk details) before relying on it.
 */
export type StarterSource = {
  name: string; community: string; govType: string; website: string | null; minutesUrl: string | null; agendasUrl: string | null;
  clerkName: string | null; clerkTitle: string | null; clerkEmail: string | null; clerkPhone: string | null;
  collectionMethod: string; evidence: string[]; notes: string | null;
};

export const STARTER_SOURCES: StarterSource[] = [
  {
    "name": "Tuscarawas County Board of Commissioners",
    "community": "Tuscarawas County",
    "govType": "county",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "web_page",
    "evidence": [
      "https://cms3.revize.com/revize/tuscarawas/Commissioners/Minutes/1-29-25.pdf",
      "https://cms3.revize.com/revize/tuscarawas/Documents/Government/Commissioners/Forms/Commissioners-Public-Records-Policy.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. County site is on Revize CMS (co.tuscarawas.oh.us, blocked; cms3.revize.com also blocked). Minutes PDFs live under cms3.revize.com/revize/tuscarawas/Commissioners/Minutes/ (e.g. 1-29-25.pdf) but the index page URL was not seen. No agendas page seen. A Feb 2025 legal notice in search snippets read 'Attest: Rhonda Jordan, Clerk' - not recorded as clerk because not confirmed current. Third-party summaries (Citizen Portal, CivicIQ) cover 2026 meetings."
  },
  {
    "name": "Dover City Council",
    "community": "Dover",
    "govType": "city",
    "website": "https://www.doverohio.com/Mayors-Office",
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://www.doverohio.com/Mayors-Office",
      "https://codelibrary.amlegal.com/codes/dover/latest/",
      "https://www.yourohionews.com/tuscarawas-county/dover-adds-new-council-members-highlights-progress/1003220"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. doverohio.com appears to be the city site (Mayor's Office page seen in results; Mayor's office 110 E. Third St.). Website field holds the only doverohio.com URL seen, not the homepage. No council minutes/agendas URL surfaced in several searches (results dominated by Dover NH). Code on American Legal."
  },
  {
    "name": "New Philadelphia City Council",
    "community": "New Philadelphia",
    "govType": "city",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://nptattler.blogspot.com/2010/01/how-does-new-philadelphia-make-its-laws.html",
      "https://city-of-np.odoo.com",
      "https://noticeregistry.com/ohio/notice/ohio-times-reporter-ordinance-new-philadelphia-ohio-257076"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. Official site not confirmed. A 2010 blog cites newphilaoh.com; city-of-np.odoo.com has a 'Municipal Archives' section but its official status is unclear. News says council meets 2nd and 4th Mondays 7:30 p.m., John Knisely Municipal Centre, 150 E. High Ave. Needs manual lookup."
  },
  {
    "name": "Uhrichsville City Council",
    "community": "Uhrichsville",
    "govType": "city",
    "website": "https://cityofuhrichsville.org/",
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "web_page",
    "evidence": [
      "https://cityofuhrichsville.org/wp-content/uploads/2022/02/12-9-21.pdf",
      "https://cityofuhrichsville.org/wp-content/uploads/2020/11/2020-06-25-MIN.pdf",
      "https://cityofuhrichsville.org/wp-content/uploads/2021/02/2019-12-12-MIN.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. WordPress site; council minutes PDFs (2013-2021) indexed under wp-content/uploads. Newest indexed: Dec 9, 2021. Minutes index page URL not seen. No agendas indexed. Minutes 2017-2020 name Trisha Addison as Clerk of Council (not recorded: may be outdated)."
  },
  {
    "name": "Baltic Village Council",
    "community": "Baltic",
    "govType": "village",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://ohioauditor.gov/auditsearch/Reports/2022/Village_of_Baltic_2021_20_Tuscarawas_FINAL.pdf",
      "https://www.co.holmes.oh.us/downloads/public/Village%20Additions%20and%20Annexations/Baltic%20Village/09)%20%20annexation%20%20p019-4453%20and%20OR%200277-6731.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No official website found. Village spans Tuscarawas/Holmes/Coshocton. Audit addressed to council at 102 W. Main St. A 2021 Holmes County record names Rose Baxter as fiscal officer (not recorded; may be outdated)."
  },
  {
    "name": "Barnhill Village Council",
    "community": "Barnhill",
    "govType": "village",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://news.yahoo.com/barnhill-village-council-180107353.html?fr=sycsrp_catchall"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No official website found; only Times-Reporter coverage."
  },
  {
    "name": "Bolivar Village Council",
    "community": "Bolivar",
    "govType": "village",
    "website": "https://villageofbolivar.com/",
    "minutesUrl": "https://www.villageofbolivar.com/meetings/",
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": "Fiscal Officer",
    "clerkEmail": "treasurer@villageofbolivar.com",
    "clerkPhone": "(330) 432-1598",
    "collectionMethod": "web_page",
    "evidence": [
      "https://www.villageofbolivar.com/meetings/",
      "https://villageofbolivar.com/",
      "https://villageofbolivar.com/officials/",
      "https://villageofbolivar.com/wp-content/uploads/2026/07/VOB-Council-Minutes-pdf-rev-05-07-2026.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. Council minutes PDFs posted under wp-content/uploads; most recent indexed May 7, 2026. /meetings/ page lists schedule; minutesUrl set to it but whether it links the PDFs is unconfirmed. Fiscal officer email/phone came from a search snippet of the homepage. Meeting location differs between pages."
  },
  {
    "name": "Dennison Village Council",
    "community": "Dennison",
    "govType": "village",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://codelibrary.amlegal.com/codes/dennisonoh/latest/dennison_oh/0-0-0-210",
      "https://ohioauditor.gov/AuditSearch/Reports/2020/Village_of_Dennison_19_18-Tuscarawas.pdf",
      "https://www.citydirectory.us/village-dennison-ohio.html"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No official website found (directory says 'not available'). Code on American Legal. Village hall reported at 302 Grant St."
  },
  {
    "name": "Gnadenhutten Village Council",
    "community": "Gnadenhutten",
    "govType": "village",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://en.wikipedia.org/wiki/Gnadenhutten,_Ohio",
      "https://news.yahoo.com/gnadenhutten-village-council-192244883.html"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. Search summary says Wikipedia lists villageofgnadenhutten.org as the website. Not recorded because the site never appeared as a result and could not be loaded."
  },
  {
    "name": "Midvale Village Council",
    "community": "Midvale",
    "govType": "village",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://news.yahoo.com/midvale-village-council-202352258.html"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No official website found; only news coverage."
  },
  {
    "name": "Mineral City Village Council",
    "community": "Mineral City",
    "govType": "village",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://en.wikipedia.org/wiki/Mineral_City,_Ohio",
      "https://www.yourohionews.com/tuscarawas-county/mineral-city-council-addresses-zoning-issues/1014122"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. Search summary says Wikipedia lists www.mineralcityoh.org as the website. Not recorded (not loaded). News gives village hall phone 330-859-2222 (village office, not specifically the clerk)."
  },
  {
    "name": "Newcomerstown Village Council",
    "community": "Newcomerstown",
    "govType": "village",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "web_platform",
    "evidence": [
      "https://evocloud-prod3-public.s3.us-east-2.amazonaws.com/meetings/55/minutes/8452.pdf",
      "https://evocloud-prod3-public.s3.us-east-2.amazonaws.com/meetings/55/agendas/18158.pdf",
      "https://www.noticeregistry.com/ohio/notice/public-hearing-newcomerstown-259864"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. Agendas and minutes are hosted on an 'evocloud' S3 bucket (meetings/55/...), likely a hosted CMS/meeting platform (vendor not identified). Minutes seen through May 4, 2026. Village website and index page not found. Council meets 1st and 3rd Mondays 7pm, 308 S. College St."
  },
  {
    "name": "Parral Village Council",
    "community": "Parral",
    "govType": "village",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://en.wikipedia.org/wiki/Parral,_Ohio",
      "https://ohioauditor.gov/AuditSearch/Reports/2021/Village_of_Parral_20_19_Tuscarawas_BASIC_AUDIT_REPORT_FINAL.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. Not in caller's expected list, but Wikipedia/population.us/state audits treat Parral as a Tuscarawas County village (pop. 205 in 2020). No website found."
  },
  {
    "name": "Port Washington Village Council",
    "community": "Port Washington",
    "govType": "village",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://www.yourohionews.com/tuscarawas-county/port-washington-council-discusses-possible-social-media-policy/1013233"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No official website found. News: meets 1st and 3rd Tuesdays 7pm at Village Hall."
  },
  {
    "name": "Roswell Village Council",
    "community": "Roswell",
    "govType": "village",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://ohioauditor.gov/AuditSearch/Reports/2024/Village_of_Roswell_22_21_Tuscarawas_BASIC_AUDIT_REPORT_FINAL.pdf",
      "https://news.yahoo.com/roswell-council-votes-move-forward-142049867.html?fr=sycsrp_catchall"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No website found. The 2021-22 audit flagged records-custodian issues."
  },
  {
    "name": "Stone Creek Village Council",
    "community": "Stone Creek",
    "govType": "village",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://ohioauditor.gov/AuditSearch/Reports/2023/Village_of_Stone_Creek_21_20_Tuscarawas_01_Basic_report_October2021_FINAL.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No website found."
  },
  {
    "name": "Strasburg Village Council",
    "community": "Strasburg",
    "govType": "village",
    "website": "https://www.villageofstrasburg.org/",
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://www.villageofstrasburg.org/village_council_/",
      "https://citizenportal.ai/articles/8228405/ohio/tuscarawas-county/strasburg/strasburg-council-approves-minutes-16556286-in-bills-and-enters-executive-session"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. Council page villageofstrasburg.org/village_council_/ gives the schedule (1st and 3rd Tuesday 6pm, 224 N. Bodmer Ave). No minutes or agendas location seen."
  },
  {
    "name": "Sugarcreek Village Council",
    "community": "Sugarcreek",
    "govType": "village",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://www.citydirectory.us/village-sugarcreek-ohio.html",
      "https://www.yourohionews.com/holmes-county/new-returning-members-sworn-in-at-sugarcreek-village-council-meeting/1003497"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. Directory and Wikipedia (via search summary) list villageofsugarcreek.com. Not recorded as website because no page from that domain appeared. Beware sugarcreekborough.us (Pennsylvania). Village office 410 S. Broadway."
  },
  {
    "name": "Tuscarawas Village Council",
    "community": "Tuscarawas",
    "govType": "village",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://ohioauditor.gov/AuditSearch/Reports/2025/Village_of_Tuscarawas_22_21_Tuscarawas_REPORT_FINAL.pdf",
      "https://www.yourohionews.com/tuscarawas-county/tuscarawas-council-addresses-parking-approves-purchases/1029488"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No website found. Address 522 E. Cherry St. (audit)."
  },
  {
    "name": "Zoar Village Council",
    "community": "Zoar",
    "govType": "village",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://www.yourohionews.com/tuscarawas-county/new-council-members-begin-terms-in-zoar/1007000"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No website found. News: meets 2nd Tuesday 6pm, 190 Fifth St. An older article gives village.zoar@gmail.com as the correspondence address (not recorded as clerk email)."
  },
  {
    "name": "Auburn Township Trustees",
    "community": "Auburn Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://www.ohioauditor.gov/AuditSearch/Reports/2025/Auburn_Township_2024_2023_Tuscarawas_FINAL.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No website found. Audit address 1029 Shanesville Rd, Sugarcreek."
  },
  {
    "name": "Bucks Township Trustees",
    "community": "Bucks Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://ohioauditor.gov/auditsearch/Reports/2024/Bucks_Township_2023_2022_Tuscarawas_FINAL.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No website found."
  },
  {
    "name": "Clay Township Trustees",
    "community": "Clay Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://ohioauditor.gov/auditsearch/Reports/2025/Clay_Township_24_23_Tuscarawas_BASIC_AUDIT_REPORT_FINAL.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No website found. PO Box 55, Gnadenhutten."
  },
  {
    "name": "Dover Township Trustees",
    "community": "Dover Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://ohioauditor.gov/AuditSearch/Reports/2025/Dover_Township_2024_2023-Tuscarawas_FINAL.pdf",
      "https://dovertownship.us/about-us/"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No confirmed website. dovertownship.us appeared in results but county not confirmed. Office 2000 Red Hill Rd NW, Dover (audit). Beware Dover Twp in Union County (dovertownshipunionoh.gov)."
  },
  {
    "name": "Fairfield Township Trustees",
    "community": "Fairfield Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://ohioauditor.gov/AuditSearch/Reports/2024/Fairfield_Township_2022_2023_Tuscarawas_FINAL.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No website found. fairfieldtwp.org results belong to other Fairfield Townships."
  },
  {
    "name": "Franklin Township Trustees",
    "community": "Franklin Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://www.wikipedia.org/wiki/Franklin_Township,_Tuscarawas_County,_Ohio",
      "https://www.ohioauditor.gov/AuditSearch/Reports/2025/Franklin_Township_2023_2022_Tuscarawas_FINAL.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. Search summary says Wikipedia lists franklintwptusc.com (not loaded, not recorded). LWV Observer Corps reports on 'Franklin Township Trustees' at my.lwv.org may be a different Franklin Township."
  },
  {
    "name": "Goshen Township Trustees",
    "community": "Goshen Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://ohioauditor.gov/AuditSearch/Reports/2024/Goshen_Township_21_20_Tuscarawas_REPORT_FINAL.pdf",
      "https://goshen-oh.gov/elected-officials/"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. goshen-oh.gov surfaced but is probably another Goshen Township (not recorded). goshentownship.com is Mahoning County. PO Box 41, New Philadelphia."
  },
  {
    "name": "Jefferson Township Trustees",
    "community": "Jefferson Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://en.wikipedia.org/wiki/Jefferson_Township,_Tuscarawas_County,_Ohio"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No website found."
  },
  {
    "name": "Lawrence Township Trustees",
    "community": "Lawrence Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://lawrencetwp-oh.org/lawrence-township-trustees/",
      "https://www.yourohionews.com/tuscarawas-county/lawrence-township-approves-2026-paving-list-sets-zoning-hearing/1018092"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. lawrencetwp-oh.org has a 'Trustee Meeting Minutes' heading and info@lawrencetwp-oh.org for older minutes, but its address (North Lawrence) suggests Lawrence Twp, STARK County. Bolivar-area coverage blurs this. Not recorded until the county is confirmed."
  },
  {
    "name": "Mill Township Trustees",
    "community": "Mill Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://en.wikipedia.org/wiki/Mill_Township,_Tuscarawas_County,_Ohio"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No website found (in.gov Mill Twp results are Indiana)."
  },
  {
    "name": "Oxford Township Trustees",
    "community": "Oxford Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://ohioauditor.gov/AuditSearch/Reports/2025/Oxford_Township_24_23_Tuscarawas_AUP_Report_FINAL.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No website found. PO Box 717, Newcomerstown."
  },
  {
    "name": "Perry Township Trustees",
    "community": "Perry Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://www.wikipedia.org/wiki/Perry_Township,_Tuscarawas_County,_Ohio"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No website found."
  },
  {
    "name": "Rush Township Trustees",
    "community": "Rush Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No Tuscarawas-specific result found."
  },
  {
    "name": "Salem Township Trustees",
    "community": "Salem Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://ohioauditor.gov/AuditSearch/Reports/2022/Salem_Township-2021-20-Tuscarawas_FINAL.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No website found."
  },
  {
    "name": "Sandy Township Trustees",
    "community": "Sandy Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://en.wikipedia.org/wiki/Sandy_Township,_Tuscarawas_County,_Ohio",
      "https://ohioauditor.gov/AuditSearch/Reports/2024/Sandy_Township_2023_2022_Tuscarawas_FINAL.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. Search summary says Wikipedia lists sandytownship.us (not loaded, not recorded). Do not confuse with Sandy Twp, Stark (sandytwp.com)."
  },
  {
    "name": "Sugar Creek Township Trustees",
    "community": "Sugar Creek Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://en.wikipedia.org/wiki/Sugar_Creek_Township,_Tuscarawas_County,_Ohio",
      "https://sugarcreektwptusc.com/"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. sugarcreektwptusc.com appeared in a result (title 'top of page', Wix-style) but was not confirmed or loaded. Note the auditor also files as 'Sugarcreek Township'."
  },
  {
    "name": "Union Township Trustees",
    "community": "Union Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://ohioauditor.gov/AuditSearch/Reports/2024/Union_Township_2023_2022_Tuscarawas_FINAL.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No website found. PO Box 202, Dennison."
  },
  {
    "name": "Warren Township Trustees",
    "community": "Warren Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://ohioauditor.gov/AuditSearch/Reports/2023/Warren_Township_22_21_Tuscarawas_FINAL.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No website found."
  },
  {
    "name": "Warwick Township Trustees",
    "community": "Warwick Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://ohioauditor.gov/AuditSearch/Reports/2024/Warwick_Township_2022_2023_Tuscarawas_FINAL.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No website found. PO Box 386, Tuscarawas."
  },
  {
    "name": "Washington Township Trustees",
    "community": "Washington Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://en.wikipedia.org/wiki/Washington_Township,_Tuscarawas_County,_Ohio"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No website found."
  },
  {
    "name": "Wayne Township Trustees",
    "community": "Wayne Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://ohioauditor.gov/AuditSearch/Reports/2022/Wayne_Township_2021_20-Tuscarawas_FINAL.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No website found. Audit address 9633 Copperhead Rd NW, Sugarcreek."
  },
  {
    "name": "York Township Trustees",
    "community": "York Township",
    "govType": "township",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://en.wikipedia.org/wiki/York_Township,_Tuscarawas_County,_Ohio",
      "https://yorktwp.org/wp-content/uploads/2025/09/07-24-25-July-Regular-Meeting.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. yorktwp.org posts trustee minutes and agendas as PDFs, but the related news coverage (Village Reporter) suggests a NW Ohio York Township. Not recorded until the county is confirmed."
  },
  {
    "name": "Dover City Schools Board of Education",
    "community": "Dover",
    "govType": "school_board",
    "website": "https://www.dovertornadoes.com/",
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "web_page",
    "evidence": [
      "https://www.dovertornadoes.com/Downloads/2023 July 17 Regular Board Meeting.pdf",
      "https://filecabinet9.eschoolview.com/2B5BF42E-09AA-4D0C-AB65-86589BDFEF50/aa9f0e75-0b9a-4862-97e9-114626f2c464.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. Website inferred from the domain of the board PDFs. eSchoolView district site; older minutes under /Downloads/, newer agendas (Oct 2025 to Aug 2026) in an eSchoolView filecabinet. Board page URL not seen."
  },
  {
    "name": "New Philadelphia City Schools Board of Education",
    "community": "New Philadelphia",
    "govType": "school_board",
    "website": "https://www.npschools.org/",
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "web_page",
    "evidence": [
      "https://www.npschools.org/Downloads/3-11-24 Regular meeting.pdf",
      "https://www.npschools.org/Downloads/Agenda Regular Meeting April 17th 2024.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. eSchoolView-style /Downloads/ PDFs for minutes and agendas (2024 indexed). Board page URL not seen."
  },
  {
    "name": "Claymont City Schools Board of Education",
    "community": "Uhrichsville/Dennison",
    "govType": "school_board",
    "website": "https://www.claymontschools.org/",
    "minutesUrl": "https://www.claymontschools.org/boardofeducation.aspx",
    "agendasUrl": "https://www.claymontschools.org/boardofeducation.aspx",
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "web_page",
    "evidence": [
      "https://www.claymontschools.org/boardofeducation.aspx",
      "https://www.claymontschools.org/Downloads/February 10,  2025 - Regular Meeting Minutes.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. Board page boardofeducation.aspx surfaced; agendas and minutes are PDFs under /Downloads/ (to 2025). Whether that page links them is unconfirmed. Superintendent office 740-922-5478 per summary."
  },
  {
    "name": "Newcomerstown Exempted Village Schools Board of Education",
    "community": "Newcomerstown",
    "govType": "school_board",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://www.nctschools.org/o/hs/news/",
      "https://ohioauditor.gov/AuditSearch/Reports/2025/Newcomerstown_EVSD_2024_Tuscarawas_FINAL.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. District site appears to be nctschools.org (Thrillshare/Apptegy-style /o/ path). No board minutes location found."
  },
  {
    "name": "Garaway Local Schools Board of Education",
    "community": "Sugarcreek",
    "govType": "school_board",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://www.yourohionews.com/holmes-county/garaway-board-of-education-sets-meeting-schedule-names-officers/1003536",
      "https://civiciq.com/public-contract/d70f94be-0b9e-4f76-87fb-fd890a3ed6c4"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. District website not surfaced. CivicIQ indexes 2026 agendas and minutes, which suggests an online source (unidentified)."
  },
  {
    "name": "Indian Valley Local Schools Board of Education",
    "community": "Gnadenhutten",
    "govType": "school_board",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "web_page",
    "evidence": [
      "https://docs.google.com/document/d/1JNWsMIkR5I3sMoagPA6O6oag-fIcRQFAltO2Fhm614I/export?format=pdf",
      "https://news.yahoo.com/indian-valley-board-education-173121576.html?fr=sycsrp_catchall"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. Minutes indexed as Google Docs PDF exports (2016 to June 2025), presumably linked from the district site, which was not found. Collection method tentative."
  },
  {
    "name": "Strasburg-Franklin Local Schools Board of Education",
    "community": "Strasburg",
    "govType": "school_board",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://www.yourohionews.com/tuscarawas-county/strasburg-board-advances-levy-land-swap/1000286",
      "https://starbridge.ai/buyer/contact/ashlee-hayes"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. District website not found. Beware franklinlocalschools.org (a different district)."
  },
  {
    "name": "Tuscarawas Valley Local Schools Board of Education",
    "community": "Zoarville/Bolivar",
    "govType": "school_board",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "web_page",
    "evidence": [
      "https://filecabinet9.eschoolview.com/E30A8D3C-DE39-4E63-9014-EEFBEFC88451/June14_2021Minutes.pdf",
      "https://filecabinet9.eschoolview.com/F3B75813-07AB-4D9B-9A70-6E54D0D9BBC6/3a9fab86-c264-4aae-8f8b-8e115c480f22.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. Minutes PDFs on an eSchoolView filecabinet (2015 to 2025). District site URL not surfaced."
  },
  {
    "name": "Buckeye Career Center (Buckeye JVSD) Board of Education",
    "community": "Tuscarawas County",
    "govType": "school_board",
    "website": "https://buckeyecareercenteroh.sites.thrillshare.com/",
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://buckeyecareercenteroh.sites.thrillshare.com/page/board-of-education"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. Thrillshare (Apptegy) board page lists members. No minutes seen. buckeyeschools.info minutes belong to Buckeye Local (another district)."
  },
  {
    "name": "Tuscarawas County Board of Health (Health Department)",
    "community": "Tuscarawas County",
    "govType": "other_board",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://www.yourohionews.com/tuscarawas-county/tuscarawas-county-health-department-releases-2025-annual-report/1027607",
      "https://www.trinitytwincity.org/upload/tuscarawas_county_chna_final_report_june_2025_2.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. Department site referenced as tchdnow.org in news (not loaded, not recorded). No board minutes found. Director@tchdnow.org is the health commissioner contact per a CHNA report."
  },
  {
    "name": "Tuscarawas County Board of Elections",
    "community": "Tuscarawas County",
    "govType": "other_board",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://www.govserv.org/US/New-Philadelphia/228227927042132/Tuscarawas-County-Board-of-Elections",
      "https://usvotefoundation.org/tuscarawas-county-oh-election-office"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. No official site or minutes found in results (Ohio BOE sites are usually boe.ohio.gov/<county>; not confirmed). Meeting notices appear on a Facebook-derived govserv listing. Office 933 E. High Ave per notices; directory phone 330-343-8819. A 2026 dispute with commissioners over bonuses is in the news."
  },
  {
    "name": "Tuscarawas County Regional Planning Commission",
    "community": "Tuscarawas County",
    "govType": "other_board",
    "website": null,
    "minutesUrl": null,
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://cms3.revize.com/revize/tuscarawas/Documents/Business/Regional%20Planning/Resources%20%26%20Townships/2018SubdivisionRegulationsFinal.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. Part of the county Revize site. No minutes or agendas found."
  },
  {
    "name": "Tuscarawas County Public Library Board of Trustees",
    "community": "Tuscarawas County",
    "govType": "other_board",
    "website": "https://www.tusclibrary.org/",
    "minutesUrl": "https://tusclibrary.org/board",
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://tusclibrary.org/board",
      "https://www.tusclibrary.org/node/211"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. Board page lists schedule (3rd Monday 5:30pm, Main Library) and president. Whether minutes are posted there is unconfirmed; minutesUrl points to the board page."
  },
  {
    "name": "Dover Public Library Board of Trustees",
    "community": "Dover",
    "govType": "other_board",
    "website": "https://www.doverlibrary.org/",
    "minutesUrl": "https://www.doverlibrary.org/?p=425",
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://www.doverlibrary.org/?p=425",
      "https://ohioauditor.gov/AuditSearch/Reports/2017/Dover_Public_Library_16_15-Tuscarawas_AUP_Report.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. Board of Trustees page (meets 2nd Thursday 7:00 AM). Minutes posting unconfirmed. Library phone 330-343-6123."
  },
  {
    "name": "Muskingum Watershed Conservancy District Board of Directors",
    "community": "Tuscarawas County",
    "govType": "other_board",
    "website": "https://mwcd.org/",
    "minutesUrl": "https://mwcd.org/get-to-know-us/board-of-directors-meeting",
    "agendasUrl": "https://mwcd.org/get-to-know-us/board-of-directors-meeting",
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "web_platform",
    "evidence": [
      "https://mwcd.org/get-to-know-us/board-of-directors-meeting",
      "https://www.mwcd.org/?p=110",
      "https://mwcd.org/wp-content/uploads/2024/05/Summary.of_.Minutes.2.23.2024-1.pdf"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. Regional water/flood district headquartered in New Philadelphia. Site says minutes and board packets are now on Diligent Community; older PDFs on WordPress. 2026 meeting dates listed."
  },
  {
    "name": "Tuscarawas County Water and Sewer District Board of Trustees",
    "community": "Tuscarawas County",
    "govType": "other_board",
    "website": "https://sites.google.com/view/tuscwsd/home",
    "minutesUrl": "https://sites.google.com/view/tuscwsd/meetings",
    "agendasUrl": null,
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://sites.google.com/view/tuscwsd/meetings",
      "https://twsd.myruralwater.com/personnel"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. Google Sites page; quarterly meetings at 9944 Wilkshire Blvd NE, Bolivar. Formed July 2024. Minutes posting unconfirmed. Related: TCMSD (sites.google.com/view/tcmsd/home), phone (330) 874-3262."
  },
  {
    "name": "Tuscarawas County University Branch District Board of Trustees (Kent State Tuscarawas)",
    "community": "New Philadelphia",
    "govType": "other_board",
    "website": "https://www.kent.edu/tusc",
    "minutesUrl": null,
    "agendasUrl": "https://www.kent.edu/tusc/notice-regular-business-meeting",
    "clerkName": null,
    "clerkTitle": null,
    "clerkEmail": null,
    "clerkPhone": null,
    "collectionMethod": "unknown",
    "evidence": [
      "https://www.kent.edu/tusc/notice-regular-business-meeting",
      "https://www.kent.edu/node/1017492"
    ],
    "notes": "All data from WebSearch results only; WebFetch/curl blocked by session network proxy, so no page was loaded. The meeting-notice page lists Dec 17, 2025 and Feb 10, 2026 meetings. No minutes found."
  }
];
