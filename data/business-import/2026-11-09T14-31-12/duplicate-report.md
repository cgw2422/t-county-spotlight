# Business import — candidate & duplicate report

Generated 2026-11-09T14:31:12.649Z · Source: OpenStreetMap (Overpass API) · License: ODbL 1.0 — © OpenStreetMap contributors
Compared against 0 existing T County Connect businesses (database: localhost:5432).

| | Count |
|---|---|
| Records found in OpenStreetMap | 295 |
| Pre-approved (approve = yes) | 72 |
| Needs review (approve = no) | 223 |
| Duplicate of an existing listing (will be skipped) | 0 |
| Duplicate within OpenStreetMap | 16 |
| Chains / brands (flagged) | 143 |
| Missing address | 153 |
| Missing city | 18 |
| Town inferred from map location (please confirm) | 149 |
| Missing phone | 202 |
| Missing website | 177 |

## By town
- New Philadelphia: 100
- Dover: 50
- Sugarcreek: 31
- Uhrichsville: 25
- Strasburg: 24
- Bolivar: 18
- (unknown): 18
- Mineral City: 8
- Newcomerstown: 7
- Zoar: 3
- Baltic: 3
- Gnadenhutten: 3
- Dundee: 2
- Dennison: 1
- Midvale: 1
- Port Washington: 1

## By category
- Food & Dining: 87
- Shopping: 55
- Automotive: 51
- Professional Services: 19
- Attractions & Recreation: 18
- Health & Wellness: 17
- Arts & Entertainment: 16
- Lodging: 16
- Home Services: 9
- Beauty & Personal Care: 5
- Photography & Media: 2

## Duplicates (never imported, existing listings are not changed)
| Name | City | Reason | Matches |
|---|---|---|---|
| Speedway | Bolivar | same place mapped twice in OpenStreetMap | OSM node/2972063772 (Speedway, 11099 Sr 212) |
| CVS Pharmacy | Dover | same place mapped twice in OpenStreetMap | OSM node/3185459875 (CVS Pharmacy, 300 Oxford Street) |
| Speedway | Dover | same place mapped twice in OpenStreetMap | OSM node/3185459876 (Speedway, 225 South Wooster Avenue) |
| Speedway | Dover | same place mapped twice in OpenStreetMap | OSM node/3192370164 (Speedway, 1042 North Tuscarawas Avenue) |
| Speedway | Dover | same place mapped twice in OpenStreetMap | OSM node/3192370165 (Speedway, 1127 North Tuscarawas Avenue) |
| Dollar General | New Philadelphia | same place mapped twice in OpenStreetMap | OSM node/9668303823 (Dollar General, 348 Bluebell Drive Northwest) |
| Joe Dump | New Philadelphia | same place mapped twice in OpenStreetMap | OSM node/13166639982 (Joe Dump, 2397 State Route 39) |
| Sheetz | New Philadelphia | same place mapped twice in OpenStreetMap | OSM node/9668303825 (Sheetz, 1281 West High Avenue) |
| Speedway | New Philadelphia | same place mapped twice in OpenStreetMap | OSM node/2910624636 (Speedway, 243 North Broadway Street) |
| Speedway | New Philadelphia | same place mapped twice in OpenStreetMap | OSM node/2910624635 (Speedway, 264 West High Avenue) |
| Speedway | New Philadelphia | same place mapped twice in OpenStreetMap | OSM node/9668303835 (Speedway, 1260 West High Avenue) |
| Speedway | Newcomerstown | same place mapped twice in OpenStreetMap | OSM node/5396826222 (Speedway, 100 Morris Crossing) |
| Bellstores | Strasburg | same place mapped twice in OpenStreetMap | OSM node/12684900626 (BellStores) |
| Circle K | Strasburg | same place mapped twice in OpenStreetMap | OSM node/11434789969 (Circle K, 219 North Wooster Avenue) |
| Big Bend Golf Course | Uhrichsville | same place mapped twice in OpenStreetMap | OSM node/3917904353 (Big Bend Golf Course) |
| Circle K | Uhrichsville | same place mapped twice in OpenStreetMap | OSM node/11420723469 (Circle K, 1103 North Water Street) |

Review `candidates.csv`: set **approve** to `yes` or `no` per row (you can also correct names, categories, addresses, phones and websites). Then run the import (dry run first).
