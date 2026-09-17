# Replacement record: legacy stress corpus (2026-09-16)

This is an engineering provenance record, not a legal authorship, ownership, license-grant, or clearance claim. It is not legal advice. It does **not** mark `PROVENANCE.md` **Verified**. Inventory `evidence_reference` remains `none`. This document is not external-release clearance.

```
record_type: replacement_record
evidence_reference: none
```

This record covers **only** the stress snapshot trees `benchmarks/fixtures/stress/legacy/` and `benchmarks/fixtures/stress/replay-frozen/`. Other fixture groups (`e2e/fixtures/**`, `benchmarks/fixtures/greenfield.ts`, `benchmarks/fixtures/fieldFlow.ts`, and remaining `benchmarks/fixtures/**` paths) were not changed.

## Operator and tools

- Date: 2026-09-16
- Human operator / requester: Ferris Bryant
- AI-assisted implementation tool: Cursor
- Active model: Grok 4.6 (stated identity of this Cursor agent session; not read from Cursor `settings.json`)
- App-generation provider/model: `unknown` / none (no Gemini, Anthropic, OpenAI, or other live provider API calls; scaffolder `--model unknown`)
- Method: Deterministic in-repo scaffolder `npm run greenfield:stress:scaffold` (`SCAFFOLD_GENERATOR_VERSION` `1`) wrote 10 Vite/React/TypeScript projects into a temporary directory. Those trees replaced the committed legacy corpus. Replay-frozen holds mechanical byte copies of five of those new legacy projects. Not sole human authorship. No claim of legal authorship, copyright ownership, non-infringement, or clearance.

## Generator version and specifications

- Generator version: `1` (`benchmarks/stress/scaffold/toolchain.ts` `SCAFFOLD_GENERATOR_VERSION`)
- Exact specifications (`SCAFFOLD_SPECIFICATIONS` / generated `scaffold-manifest.json`):
  - `benchmarks/stress/prompts.ts (STRESS_PROMPTS ids, minPages, expectedKeywords, Pages list)`
  - `src/core/greenfield/types.ts (GREENFIELD_FILE_PATHS)`
  - `package.json (react ^19.2.7, react-dom ^19.2.7, @types/react ^19.2.16, @types/react-dom ^19.2.3, @vitejs/plugin-react ^6.0.2, typescript ^6.0.3, vite ^8.0.16)`
- Temporary generation root: `/private/tmp/bryantlabs-stress-replace-20260916-Fh0dxW` (not committed; `scaffold-manifest.json` stayed in that temp directory)
- Manifest `generatedAt`: `2026-09-17T00:42:52.578Z`

## Lockfiles

Replay consumers (`benchmarks/stress/repairReplay.ts`) copy the project tree (skipping `node_modules`, `.git`, `dist`) and then run `npm install`. They do not require `package-lock.json` to exist. `GREENFIELD_FILE_PATHS` does not include lockfiles. Fresh lockfiles were therefore **not** added. Nested `package.json` files in these trees are dependency metadata (declared ranges only), not a first-party originality claim.

## Tree file counts and hashes

Tree SHA-256 is SHA-256 over sorted relative paths and file bytes (UTF-8/binary as stored), excluding `node_modules`, `.git`, and `dist`.

### `benchmarks/fixtures/stress/legacy/`

- Old: 239 files, `836367df234b9ad7867919f94029d2f137405e1bf6cf1c430f7c62c25ea3ebc5`
- New: 169 files, `e9b683a93b009c35c711569951d3fea45d82de896bec5b27eade4bf043009767`

| Project | Old files | Old tree SHA-256 | New files | New tree SHA-256 |
| --- | ---: | --- | ---: | --- |
| eventops-planner | 24 | `8e7b5bd3fb2a972a7ded45dd0445fa3ccbca321bf258ff3bc0616e674a7cab17` | 17 | `60ecee33435a4b44e4f242f4f53f5726656807ed6033a1cb48264b60979378ce` |
| fleetops-pro | 24 | `74be61f5745f3cb9a3c2049867d68809e2b58d9565f0146d6f40727f76efc6f6` | 17 | `5af65bbd84dcb9cb9a8b08a590c735d96664db335ba960e32a6a0a8acf6b62b5` |
| hr-command-center | 24 | `f05f8a5858b6ff11d3da0367d4bdd9a85e29b642bbf2b805ecde8ca58e309a09` | 17 | `2779d478d9a8dfa87838c2fb85f8b29845d5eaa2ba3c51d5c39d8590501e0dfc` |
| inventory-command | 23 | `3fbcf531d2958c653e54adaeac33633dde4ecfab1e30ea0f69d1239f5097aacd` | 16 | `e286ff3df57394a50cdb9c05ae1ec9424267eb6e66994ea6a8c347e2b3c7d99e` |
| legalcase-vault | 24 | `6f6f91393ee6d77e6ff50aab65fb80d76097a86d9b173c9cccb5dffbd797f5ee` | 17 | `2de2b74b21b5d9e4e730a6a2524e99ba6985060c40e4a103efe1211e99838466` |
| medtrack-clinic | 23 | `c1ec2d0a1370c5a64ce393d7843b0a5786f92436ad13c29c6711b4a71c9d2539` | 16 | `e882f326a5b27575b0a3dc0c401dcf75003940aedf96299de7cf3adfd1ca2783` |
| propertymanager-pro | 25 | `7ea413eee0ac17939aefa1f71137d2e65c2950af7bb8d2fffa94d63ea0c7cacf` | 17 | `f76da59d07b4830c4ca9d8fdd9ef3b814580683b5c780531322c11f734a4e307` |
| repairshop-manager | 24 | `08a4773f7d8aab31012ed0f09ac77015a2da78ad5dc9d3f1b5df244d9b2bd3a9` | 17 | `53083dba5f2a8f1458875f34948b82c16b57129eb97e5992603a9956641e7775` |
| restaurantops | 23 | `65a32f98d3ef63a609a2efe0c02c3aaee512667e92276183110c9d1c91d98e3b` | 17 | `626928554e7cbb52d682616750f54b5ff8691cff0811d3b6f88efca531dc4514` |
| schoolops-portal | 25 | `c87b52fd1562cda9be9d6574f84076357ee832bbe6c67eefbbea9c36949953f3` | 18 | `8b5556412c1b5f4abdaa881d04382e2a19917c53d6750f56eff952f20db3209f` |

### `benchmarks/fixtures/stress/replay-frozen/`

Replay-frozen projects are mechanical byte copies of their corresponding new legacy projects (`fleetops-pro`, `inventory-command`, `legalcase-vault`, `medtrack-clinic`, `schoolops-portal`). No historical frozen files were reused.

- Old: 120 files, `0b882f53592c63ffc08893bf1e40527524e4cd30a724b526115ea8cf3a4d8ecf`
- New: 84 files, `6131d0c9656da9efab9631e2fad1d8032cd742a40ff9a5eecaf676d6caa01c8f`

| Project | Old files | Old tree SHA-256 | New files | New tree SHA-256 (matches new legacy sibling) |
| --- | ---: | --- | ---: | --- |
| fleetops-pro | 24 | `ae7b7944b02ecfa1e0a52c99b3bfc8dd580906decf62a5510c39f8a2d50031ea` | 17 | `5af65bbd84dcb9cb9a8b08a590c735d96664db335ba960e32a6a0a8acf6b62b5` |
| inventory-command | 23 | `d8b6fb2dc82545050c840a51e61e4a7a6b86087d6f92c963ee58b1dc045251e3` | 16 | `e286ff3df57394a50cdb9c05ae1ec9424267eb6e66994ea6a8c347e2b3c7d99e` |
| legalcase-vault | 25 | `69923e638422ea7d9e3c828cd6d7380e916624a2e009079bcfcafe8f1384d262` | 17 | `2de2b74b21b5d9e4e730a6a2524e99ba6985060c40e4a103efe1211e99838466` |
| medtrack-clinic | 23 | `9f9b1e9cd4accb4630a5686eb504fcb29611d9f3cbde253c4985841fe6cbc153` | 16 | `e882f326a5b27575b0a3dc0c401dcf75003940aedf96299de7cf3adfd1ca2783` |
| schoolops-portal | 25 | `8e08a338d0565740aada4a8db52f38c2f61d6de6a07fd7208283a7e82cda2463` | 18 | `8b5556412c1b5f4abdaa881d04382e2a19917c53d6750f56eff952f20db3209f` |

## SHA-256 (file bytes of every corpus file intended for commit)

- `benchmarks/fixtures/stress/legacy/eventops-planner/index.html`  
  `ca1c2052054c90bb3aafb2970703be544b132a900405305e2de795ee1b71febc`
- `benchmarks/fixtures/stress/legacy/eventops-planner/package.json`  
  `6e229f1910cf80c3287a9a83416d32cc6cd432062f301356db86dbeaee7d552c`
- `benchmarks/fixtures/stress/legacy/eventops-planner/src/App.tsx`  
  `7156243c4e57d2829f6a39a873c4f79bd81b51dd2d92f6b7807a0e36ca50b130`
- `benchmarks/fixtures/stress/legacy/eventops-planner/src/index.css`  
  `d4ebdf357a96b057864e12a53495b028c4ff4d4c67df681da4d08492a514659c`
- `benchmarks/fixtures/stress/legacy/eventops-planner/src/main.tsx`  
  `acc11682711269285ad5cdca42eb3623215e9083d43b14f969389fbd55db68a3`
- `benchmarks/fixtures/stress/legacy/eventops-planner/src/pages/Budgets.tsx`  
  `1e62e056294e112c98ac8e721cdb7d49066e55ee1df33fa7b32a9cbfbf6970e1`
- `benchmarks/fixtures/stress/legacy/eventops-planner/src/pages/Dashboard.tsx`  
  `02b858ab54127307bc3b95d4956666176e9ee58b192e6268b378a4504f2b04fe`
- `benchmarks/fixtures/stress/legacy/eventops-planner/src/pages/Events.tsx`  
  `e08d626da31e7b2ac5d264861c759f591c156f4fe49b938c50e5c211b42a1c8d`
- `benchmarks/fixtures/stress/legacy/eventops-planner/src/pages/Guests.tsx`  
  `0363439e4071872803a7d446830fa09622414082b4d1c2bf727f4de050090a32`
- `benchmarks/fixtures/stress/legacy/eventops-planner/src/pages/Reports.tsx`  
  `81aeef8a07c2942e5b72293fdf3c21be42a65bd46e48be3f9a9189f2906a369f`
- `benchmarks/fixtures/stress/legacy/eventops-planner/src/pages/Schedules.tsx`  
  `f2ee734f67f761163581d35220b5f6a89fa29a0915524fa10d1f3b2d3a1dd333`
- `benchmarks/fixtures/stress/legacy/eventops-planner/src/pages/Tasks.tsx`  
  `0f0f145fca10c7fd43980acaa9f2f0f3b993e51321f022a72e3c1625b24f3c20`
- `benchmarks/fixtures/stress/legacy/eventops-planner/src/pages/Vendors.tsx`  
  `3c3c3c32f3459ee8f5f323298e7f99135e5d45432cff91541c48ad7b6bbc7810`
- `benchmarks/fixtures/stress/legacy/eventops-planner/src/pages/Venues.tsx`  
  `0edf154b0dc6770b01ce6058586d1e0d9a0ca6bb1555faead8136c7d08efcce0`
- `benchmarks/fixtures/stress/legacy/eventops-planner/src/vite-env.d.ts`  
  `65996936fbb042915f7b74a200fcdde7e410f32a669b1ab9597cfaa4b0faddb5`
- `benchmarks/fixtures/stress/legacy/eventops-planner/tsconfig.json`  
  `53cedb29c7cdd97965dfc9d4d192a7f2567d97fba95c14c942effd1817d02a38`
- `benchmarks/fixtures/stress/legacy/eventops-planner/vite.config.ts`  
  `eca485c281977125366d4800553256e419f364984e615f75a2d2bae54f7857fd`
- `benchmarks/fixtures/stress/legacy/fleetops-pro/index.html`  
  `fd6242f11c8a2ea1e71db1c994718dcf83b0cd2ecdfc8ebb0251d5e3946b608c`
- `benchmarks/fixtures/stress/legacy/fleetops-pro/package.json`  
  `c778be95c7ebb6342121187531bd083771075310116b758686ed652f352f41d1`
- `benchmarks/fixtures/stress/legacy/fleetops-pro/src/App.tsx`  
  `e880f90616054711fcd881ac243b45b7854beb8ea0d08849ee00747c956e1c81`
- `benchmarks/fixtures/stress/legacy/fleetops-pro/src/index.css`  
  `d4ebdf357a96b057864e12a53495b028c4ff4d4c67df681da4d08492a514659c`
- `benchmarks/fixtures/stress/legacy/fleetops-pro/src/main.tsx`  
  `acc11682711269285ad5cdca42eb3623215e9083d43b14f969389fbd55db68a3`
- `benchmarks/fixtures/stress/legacy/fleetops-pro/src/pages/Dashboard.tsx`  
  `be1fbe7655dda982596b53bfeed22cf3d9a3023b2e2f233d46dcad2906f8cd41`
- `benchmarks/fixtures/stress/legacy/fleetops-pro/src/pages/Dispatch.tsx`  
  `feedbcb1b68850f36747562e89d09d542a7f1e0241a4b7d8ceef280d6955f80d`
- `benchmarks/fixtures/stress/legacy/fleetops-pro/src/pages/Drivers.tsx`  
  `e7ce1e99361cdb8b62c58dd01aaf3dae51316879f647483578e58a7cc7bb7500`
- `benchmarks/fixtures/stress/legacy/fleetops-pro/src/pages/FuelLogs.tsx`  
  `ccef803fa0f205263525e5df7a1537f79474dda71672909b47aa0e3fd4b2e401`
- `benchmarks/fixtures/stress/legacy/fleetops-pro/src/pages/Inspections.tsx`  
  `9aeaef29de4e700d85bf287ec42a777f089c5cc6be850ae89e301136fef573a6`
- `benchmarks/fixtures/stress/legacy/fleetops-pro/src/pages/Maintenance.tsx`  
  `8d9e2c97e35a75d9dcd660c4758d86db27e3cdd229911dc674edde567886120a`
- `benchmarks/fixtures/stress/legacy/fleetops-pro/src/pages/Reports.tsx`  
  `d1f84b4e2fb21687bf4065df8e25ff6a832681ff5f99213d9be180614357d456`
- `benchmarks/fixtures/stress/legacy/fleetops-pro/src/pages/Settings.tsx`  
  `97a0992d3cb0867ea5c01a7e05800eb66bb962db91c63e8fb17b8e6fa8dd41b1`
- `benchmarks/fixtures/stress/legacy/fleetops-pro/src/pages/Vehicles.tsx`  
  `e12bf0e8066b374864c0bfe74175f9471ad846a4cc27af455bd733baada800db`
- `benchmarks/fixtures/stress/legacy/fleetops-pro/src/vite-env.d.ts`  
  `65996936fbb042915f7b74a200fcdde7e410f32a669b1ab9597cfaa4b0faddb5`
- `benchmarks/fixtures/stress/legacy/fleetops-pro/tsconfig.json`  
  `53cedb29c7cdd97965dfc9d4d192a7f2567d97fba95c14c942effd1817d02a38`
- `benchmarks/fixtures/stress/legacy/fleetops-pro/vite.config.ts`  
  `eca485c281977125366d4800553256e419f364984e615f75a2d2bae54f7857fd`
- `benchmarks/fixtures/stress/legacy/hr-command-center/index.html`  
  `ffe586ec40e1e90df2178c39bf5cac492f21578353e47263312538266d4b71f3`
- `benchmarks/fixtures/stress/legacy/hr-command-center/package.json`  
  `46a6aeac652d367b33941ce917b20a7b7acf1ffed3617c37e1b44bfa9bf7a46c`
- `benchmarks/fixtures/stress/legacy/hr-command-center/src/App.tsx`  
  `6f500e19eb65caa304feb10b8b04e6be90d82c7b4280342f69ed1ac4dd1317aa`
- `benchmarks/fixtures/stress/legacy/hr-command-center/src/index.css`  
  `d4ebdf357a96b057864e12a53495b028c4ff4d4c67df681da4d08492a514659c`
- `benchmarks/fixtures/stress/legacy/hr-command-center/src/main.tsx`  
  `acc11682711269285ad5cdca42eb3623215e9083d43b14f969389fbd55db68a3`
- `benchmarks/fixtures/stress/legacy/hr-command-center/src/pages/Dashboard.tsx`  
  `fdd0a5aa574c5f4ba9c9c53353cd2333617f276e17a9b846b902718ec99dc5fe`
- `benchmarks/fixtures/stress/legacy/hr-command-center/src/pages/Departments.tsx`  
  `5571ec655e636c76fd6c3ac9d5e1bfedf5c66fd146a59b87ce9dc7ed45ba53e8`
- `benchmarks/fixtures/stress/legacy/hr-command-center/src/pages/Documents.tsx`  
  `9f948b6b285ad6b264cec056a4b1e95a63a3c3ae4f22b78415c3825acecd7b11`
- `benchmarks/fixtures/stress/legacy/hr-command-center/src/pages/Employees.tsx`  
  `4f0d65f62ec3f93e9c8f8e50b492ee9df2d40003b290c9ce2ad630ad9cc56cc6`
- `benchmarks/fixtures/stress/legacy/hr-command-center/src/pages/Onboarding.tsx`  
  `d71e289bfae3ac2cd7b8cc05535d553dcdd39bb91a482baed3c4e642355bad7f`
- `benchmarks/fixtures/stress/legacy/hr-command-center/src/pages/PayrollSummary.tsx`  
  `a29ee9d711227e42283b1aad51a6bfbfc0bfa32fb5051b1e7171b235a8f21f63`
- `benchmarks/fixtures/stress/legacy/hr-command-center/src/pages/PerformanceReviews.tsx`  
  `8e0b457cd41f6512423c685c23ae2a5140317bba47b8d7d5269e72d190e6a74a`
- `benchmarks/fixtures/stress/legacy/hr-command-center/src/pages/Reports.tsx`  
  `42858ee0ec905a910b4e3e10c354c6e78eca859dd20d76492ab22e1bd880edd6`
- `benchmarks/fixtures/stress/legacy/hr-command-center/src/pages/TimeOff.tsx`  
  `dae8eeb9574ba728d50865a796eeb0982307bb8c0bc21d829c5a4e683e297451`
- `benchmarks/fixtures/stress/legacy/hr-command-center/src/vite-env.d.ts`  
  `65996936fbb042915f7b74a200fcdde7e410f32a669b1ab9597cfaa4b0faddb5`
- `benchmarks/fixtures/stress/legacy/hr-command-center/tsconfig.json`  
  `53cedb29c7cdd97965dfc9d4d192a7f2567d97fba95c14c942effd1817d02a38`
- `benchmarks/fixtures/stress/legacy/hr-command-center/vite.config.ts`  
  `eca485c281977125366d4800553256e419f364984e615f75a2d2bae54f7857fd`
- `benchmarks/fixtures/stress/legacy/inventory-command/index.html`  
  `62ac8e2f0d3b7d1d453c382ac8fa96ed0f83dff42d36222f778bcafd092c0e01`
- `benchmarks/fixtures/stress/legacy/inventory-command/package.json`  
  `4407155c73968cca2972e5096ac6f8cb48c7638cf6711e24443c194a83719edd`
- `benchmarks/fixtures/stress/legacy/inventory-command/src/App.tsx`  
  `b649285b10e9762a0c0cc8aa46b40b0a99f0d3b4205510f4692f5e2d448e44cf`
- `benchmarks/fixtures/stress/legacy/inventory-command/src/index.css`  
  `d4ebdf357a96b057864e12a53495b028c4ff4d4c67df681da4d08492a514659c`
- `benchmarks/fixtures/stress/legacy/inventory-command/src/main.tsx`  
  `acc11682711269285ad5cdca42eb3623215e9083d43b14f969389fbd55db68a3`
- `benchmarks/fixtures/stress/legacy/inventory-command/src/pages/Alerts.tsx`  
  `36481bf348566f241ea701f3c542b4367b7eb504faaf2f875128918798b00aa5`
- `benchmarks/fixtures/stress/legacy/inventory-command/src/pages/Dashboard.tsx`  
  `709520f078dceb1cd1b3025749f6e673b81f6ce377fd4ab6f20a36ced7e638e9`
- `benchmarks/fixtures/stress/legacy/inventory-command/src/pages/Products.tsx`  
  `14908816df311e2c34ab3ab90e30fafa393fcc7838be1ea2fcb86b59c19b0c19`
- `benchmarks/fixtures/stress/legacy/inventory-command/src/pages/PurchaseOrders.tsx`  
  `586007f9ea336c2158c82dbac5e629ed2cbeabec5293f9713d1e865830d33097`
- `benchmarks/fixtures/stress/legacy/inventory-command/src/pages/Reports.tsx`  
  `7c2f62fcb32390f09f3cd778da272246023292c99d94e9e632fc2c20d75df5ac`
- `benchmarks/fixtures/stress/legacy/inventory-command/src/pages/Settings.tsx`  
  `9c0ad646310975e13491a64bb868546d67c1437b111e33f38c43b9b2498fbb89`
- `benchmarks/fixtures/stress/legacy/inventory-command/src/pages/StockMovements.tsx`  
  `92fd95a775a5b877eef1c4be8a6c722bd4da8b6e82cbaf3cdbf9e91c8447b3ab`
- `benchmarks/fixtures/stress/legacy/inventory-command/src/pages/Suppliers.tsx`  
  `262ee32c523c78b06ddd45582c636694350b58a6cc731257744a2810ec283262`
- `benchmarks/fixtures/stress/legacy/inventory-command/src/vite-env.d.ts`  
  `65996936fbb042915f7b74a200fcdde7e410f32a669b1ab9597cfaa4b0faddb5`
- `benchmarks/fixtures/stress/legacy/inventory-command/tsconfig.json`  
  `53cedb29c7cdd97965dfc9d4d192a7f2567d97fba95c14c942effd1817d02a38`
- `benchmarks/fixtures/stress/legacy/inventory-command/vite.config.ts`  
  `eca485c281977125366d4800553256e419f364984e615f75a2d2bae54f7857fd`
- `benchmarks/fixtures/stress/legacy/legalcase-vault/index.html`  
  `cf3854cdf8b1e590da57186444fc76f2769c4df0a4ce78a14f506f2017970577`
- `benchmarks/fixtures/stress/legacy/legalcase-vault/package.json`  
  `ed3604bb9cce5d18c2c6f70a5d14cf3ad9b4986ca13be28c4463bc43f200c455`
- `benchmarks/fixtures/stress/legacy/legalcase-vault/src/App.tsx`  
  `5b8a843c0de72da463920f0b9ddbf1c212ac76e2637f9ccfc5657d5c0a0d85fb`
- `benchmarks/fixtures/stress/legacy/legalcase-vault/src/index.css`  
  `d4ebdf357a96b057864e12a53495b028c4ff4d4c67df681da4d08492a514659c`
- `benchmarks/fixtures/stress/legacy/legalcase-vault/src/main.tsx`  
  `acc11682711269285ad5cdca42eb3623215e9083d43b14f969389fbd55db68a3`
- `benchmarks/fixtures/stress/legacy/legalcase-vault/src/pages/Cases.tsx`  
  `aa492423f1de911cb5d72575e0576df40ccf7175ddb365529369f84dadd65e80`
- `benchmarks/fixtures/stress/legacy/legalcase-vault/src/pages/Clients.tsx`  
  `5d66b4a63fdc42e0668670aa7478045e157020384d7dbf4f3a8856c7f5f71aff`
- `benchmarks/fixtures/stress/legacy/legalcase-vault/src/pages/Dashboard.tsx`  
  `6df8ea32407015cb437de66c0e88c08fb52fe374eb2f8ba82d67be9000a70b4b`
- `benchmarks/fixtures/stress/legacy/legalcase-vault/src/pages/Deadlines.tsx`  
  `cd3273cbfd2014504c22c63c88bb17e26a3ce3b3df22cb2f08390ecf5120a17a`
- `benchmarks/fixtures/stress/legacy/legalcase-vault/src/pages/Documents.tsx`  
  `1ad657b379195e1adc8a5c906d4a7600ed51bc2e95638f6355a46b9ea2d82931`
- `benchmarks/fixtures/stress/legacy/legalcase-vault/src/pages/Evidence.tsx`  
  `14959dbbf039050680f0e965bd114c9ac097d2629f6aab967c313b49de7abd8f`
- `benchmarks/fixtures/stress/legacy/legalcase-vault/src/pages/Hearings.tsx`  
  `faf6d0291f5468ed78b3576a1aaaad9631972dc032f1c920ebcb30c9babbbcd8`
- `benchmarks/fixtures/stress/legacy/legalcase-vault/src/pages/Notes.tsx`  
  `4b087e65ee3d0d14550142f326851b6864b6a8daf8047ab22d618688ae9d4388`
- `benchmarks/fixtures/stress/legacy/legalcase-vault/src/pages/Reports.tsx`  
  `a77ae1f8e6f31975831956663bdab6bece6d207c9f89b4dd0800f09ddc598fc7`
- `benchmarks/fixtures/stress/legacy/legalcase-vault/src/vite-env.d.ts`  
  `65996936fbb042915f7b74a200fcdde7e410f32a669b1ab9597cfaa4b0faddb5`
- `benchmarks/fixtures/stress/legacy/legalcase-vault/tsconfig.json`  
  `53cedb29c7cdd97965dfc9d4d192a7f2567d97fba95c14c942effd1817d02a38`
- `benchmarks/fixtures/stress/legacy/legalcase-vault/vite.config.ts`  
  `eca485c281977125366d4800553256e419f364984e615f75a2d2bae54f7857fd`
- `benchmarks/fixtures/stress/legacy/medtrack-clinic/index.html`  
  `0ebd164a364340e3c7350c3baf3436ebc47d12b4e2a807601f78abbb3dc07e30`
- `benchmarks/fixtures/stress/legacy/medtrack-clinic/package.json`  
  `4d4ee77b8e45f65030015cf9419f0dda2d7a4d96f9da060fcc06e8f26c126a7c`
- `benchmarks/fixtures/stress/legacy/medtrack-clinic/src/App.tsx`  
  `91e3c7c65d3b0992b3cfab2ffbb7c86ac2b0d06c6031b5229a7c862fc3ad1bfb`
- `benchmarks/fixtures/stress/legacy/medtrack-clinic/src/index.css`  
  `d4ebdf357a96b057864e12a53495b028c4ff4d4c67df681da4d08492a514659c`
- `benchmarks/fixtures/stress/legacy/medtrack-clinic/src/main.tsx`  
  `acc11682711269285ad5cdca42eb3623215e9083d43b14f969389fbd55db68a3`
- `benchmarks/fixtures/stress/legacy/medtrack-clinic/src/pages/Appointments.tsx`  
  `60283a7ec06d785d24546932b4db444af92f644d1615bf283c0f44d873dba7c0`
- `benchmarks/fixtures/stress/legacy/medtrack-clinic/src/pages/Billing.tsx`  
  `4f1094383712e8cb9d479df23c1438c370c1db92d73b64b9dce2e0ac9a717efd`
- `benchmarks/fixtures/stress/legacy/medtrack-clinic/src/pages/Dashboard.tsx`  
  `09e088583ebfc7f5a70fe6872b88ae78c27fec7fb418252e8f4e5f71e8890e56`
- `benchmarks/fixtures/stress/legacy/medtrack-clinic/src/pages/Patients.tsx`  
  `9d2a58c4f8d2ac0c4463c1b17e6275769bfb493729edbe48a65c34436858a0e2`
- `benchmarks/fixtures/stress/legacy/medtrack-clinic/src/pages/Prescriptions.tsx`  
  `6d9c102e88910a1f1a2111f50d60fa4cab27d63af3f633a5257f95eef7c4519c`
- `benchmarks/fixtures/stress/legacy/medtrack-clinic/src/pages/Providers.tsx`  
  `733a8125b0334a51bbfbdfbb0337a4bc5198fa0420b14f220333bb4772ef2c88`
- `benchmarks/fixtures/stress/legacy/medtrack-clinic/src/pages/Reports.tsx`  
  `6a251849cd026485f62c6320d417fa214e272ec104609ea0f49438880433f124`
- `benchmarks/fixtures/stress/legacy/medtrack-clinic/src/pages/VisitNotes.tsx`  
  `226abaecca1347ac3ce0d6652d630f868ca595a566592c5495aefd7df8b66bff`
- `benchmarks/fixtures/stress/legacy/medtrack-clinic/src/vite-env.d.ts`  
  `65996936fbb042915f7b74a200fcdde7e410f32a669b1ab9597cfaa4b0faddb5`
- `benchmarks/fixtures/stress/legacy/medtrack-clinic/tsconfig.json`  
  `53cedb29c7cdd97965dfc9d4d192a7f2567d97fba95c14c942effd1817d02a38`
- `benchmarks/fixtures/stress/legacy/medtrack-clinic/vite.config.ts`  
  `eca485c281977125366d4800553256e419f364984e615f75a2d2bae54f7857fd`
- `benchmarks/fixtures/stress/legacy/propertymanager-pro/index.html`  
  `115b9d2942ea14b321d952fb081e6b48ac6d04124a7cec17350412060395e37c`
- `benchmarks/fixtures/stress/legacy/propertymanager-pro/package.json`  
  `bcf8937da9e181272ab10369d9172305b7a600d3658bcef276d20caa2075e9db`
- `benchmarks/fixtures/stress/legacy/propertymanager-pro/src/App.tsx`  
  `bc5e6854391bf3d96a7b9d50d15edf8773c3c74b6e63b8722567146b27d07bbf`
- `benchmarks/fixtures/stress/legacy/propertymanager-pro/src/index.css`  
  `d4ebdf357a96b057864e12a53495b028c4ff4d4c67df681da4d08492a514659c`
- `benchmarks/fixtures/stress/legacy/propertymanager-pro/src/main.tsx`  
  `acc11682711269285ad5cdca42eb3623215e9083d43b14f969389fbd55db68a3`
- `benchmarks/fixtures/stress/legacy/propertymanager-pro/src/pages/Dashboard.tsx`  
  `5e7a8bbfe7a3dd7446a4e04a928289e23d42e27f650b9f3412e43d2627cd379d`
- `benchmarks/fixtures/stress/legacy/propertymanager-pro/src/pages/Inspections.tsx`  
  `b070760fef2a60acc49e494057dbdf1fca8b0dfe64b0d7ad4ab2594c3b3920ec`
- `benchmarks/fixtures/stress/legacy/propertymanager-pro/src/pages/Leases.tsx`  
  `a91c465c9e7c92341828b1d9e70cab8365850b7297db933248ac8488980846f0`
- `benchmarks/fixtures/stress/legacy/propertymanager-pro/src/pages/MaintenanceRequests.tsx`  
  `db59bd16a38521b1b2a413f909aadc69289b168ec40d05b4ffdad653e4463c41`
- `benchmarks/fixtures/stress/legacy/propertymanager-pro/src/pages/Notices.tsx`  
  `df2e11f703cb301afc5822145c3b59dc85240dbef3e3c150ee902efb45ba3fc5`
- `benchmarks/fixtures/stress/legacy/propertymanager-pro/src/pages/RentPayments.tsx`  
  `8cea80436b23a30a0c463aa7b89fa9a1d734656dab9abe3de7cc56e681bd8a29`
- `benchmarks/fixtures/stress/legacy/propertymanager-pro/src/pages/Reports.tsx`  
  `cedd1f29688cf5236da5ef4561987eea60bae9367cfa9fdd161db909918d30ac`
- `benchmarks/fixtures/stress/legacy/propertymanager-pro/src/pages/Tenants.tsx`  
  `be7b8032c1294051c7eb92a811234356145ceac7e71050ce400842c5cf52fbcf`
- `benchmarks/fixtures/stress/legacy/propertymanager-pro/src/pages/Units.tsx`  
  `e1184a3fa85443e589f09c5b958204d7ba982206332c1102dbd86dbb0a8a57a0`
- `benchmarks/fixtures/stress/legacy/propertymanager-pro/src/vite-env.d.ts`  
  `65996936fbb042915f7b74a200fcdde7e410f32a669b1ab9597cfaa4b0faddb5`
- `benchmarks/fixtures/stress/legacy/propertymanager-pro/tsconfig.json`  
  `53cedb29c7cdd97965dfc9d4d192a7f2567d97fba95c14c942effd1817d02a38`
- `benchmarks/fixtures/stress/legacy/propertymanager-pro/vite.config.ts`  
  `eca485c281977125366d4800553256e419f364984e615f75a2d2bae54f7857fd`
- `benchmarks/fixtures/stress/legacy/repairshop-manager/index.html`  
  `6464690659961c4ec188b4be88acb1d9b397004b51fb7dbe0dc12ff8ce871ce3`
- `benchmarks/fixtures/stress/legacy/repairshop-manager/package.json`  
  `16942b4f3f9816b3e4013054f3f91e9acadbb5114d368c518dce450a69648da0`
- `benchmarks/fixtures/stress/legacy/repairshop-manager/src/App.tsx`  
  `58a97d356d462cd805a2b29fc04dadd10405b9665b89a9fa56b54b04b1ab2bf7`
- `benchmarks/fixtures/stress/legacy/repairshop-manager/src/index.css`  
  `d4ebdf357a96b057864e12a53495b028c4ff4d4c67df681da4d08492a514659c`
- `benchmarks/fixtures/stress/legacy/repairshop-manager/src/main.tsx`  
  `acc11682711269285ad5cdca42eb3623215e9083d43b14f969389fbd55db68a3`
- `benchmarks/fixtures/stress/legacy/repairshop-manager/src/pages/Customers.tsx`  
  `5b4453b6ca37d76a83f7454c1be2c2677f0b3284247099c98ceb313786761761`
- `benchmarks/fixtures/stress/legacy/repairshop-manager/src/pages/Dashboard.tsx`  
  `82c1f036aa08d83b6e4b5b5f626fbdb81f194240469e0ef9c186af8f5c58aea0`
- `benchmarks/fixtures/stress/legacy/repairshop-manager/src/pages/Estimates.tsx`  
  `912eb2c07af6d14c0c3f033641c35b799fce8c5cb01a4c6729e36e66a9e8838d`
- `benchmarks/fixtures/stress/legacy/repairshop-manager/src/pages/Invoices.tsx`  
  `7ce93afb784147704eed9f8075bdf7aebf500194256a10ac0f8c46c69c7a6a0e`
- `benchmarks/fixtures/stress/legacy/repairshop-manager/src/pages/PartsInventory.tsx`  
  `35b4f37116d003d48c9e1cdfcd201278735cdeaa748809d0acb12dff31320945`
- `benchmarks/fixtures/stress/legacy/repairshop-manager/src/pages/ServiceHistory.tsx`  
  `b79b2d3f4867219e2a20d9ee1f9a3decf12c1231ed95cd679fd11dc422dc883a`
- `benchmarks/fixtures/stress/legacy/repairshop-manager/src/pages/Technicians.tsx`  
  `e1ce8858ef38ffb5d54f26755e8ab4d1f97b042d3be2d596b5d3b2166b8b68af`
- `benchmarks/fixtures/stress/legacy/repairshop-manager/src/pages/Vehicles.tsx`  
  `c10342f7cf0c8e870ede0e93811001f73279e4853c1d9211166d5c6158eb814b`
- `benchmarks/fixtures/stress/legacy/repairshop-manager/src/pages/WorkOrders.tsx`  
  `369eac70e5ed0b3cdc0b5db84e1b36004f50f0b51a999ece45916f21edd74268`
- `benchmarks/fixtures/stress/legacy/repairshop-manager/src/vite-env.d.ts`  
  `65996936fbb042915f7b74a200fcdde7e410f32a669b1ab9597cfaa4b0faddb5`
- `benchmarks/fixtures/stress/legacy/repairshop-manager/tsconfig.json`  
  `53cedb29c7cdd97965dfc9d4d192a7f2567d97fba95c14c942effd1817d02a38`
- `benchmarks/fixtures/stress/legacy/repairshop-manager/vite.config.ts`  
  `eca485c281977125366d4800553256e419f364984e615f75a2d2bae54f7857fd`
- `benchmarks/fixtures/stress/legacy/restaurantops/index.html`  
  `72d4b283f2a6692a4ab99bd1afc2904d78fe597a671a38ac564694ee07fc1fd6`
- `benchmarks/fixtures/stress/legacy/restaurantops/package.json`  
  `9c3bc7cb577bcfd4485505f80c7d29b2dd095da13e7a60284c94ab8cf01e9674`
- `benchmarks/fixtures/stress/legacy/restaurantops/src/App.tsx`  
  `49b12e3b57041c862a1cfb51b171ba5bec0f2adf80594a6a92fe56cea91aa8c6`
- `benchmarks/fixtures/stress/legacy/restaurantops/src/index.css`  
  `d4ebdf357a96b057864e12a53495b028c4ff4d4c67df681da4d08492a514659c`
- `benchmarks/fixtures/stress/legacy/restaurantops/src/main.tsx`  
  `acc11682711269285ad5cdca42eb3623215e9083d43b14f969389fbd55db68a3`
- `benchmarks/fixtures/stress/legacy/restaurantops/src/pages/Dashboard.tsx`  
  `78add0fcfa488d706072b153649cde20a18a0bad2e5805e583949d78e0517548`
- `benchmarks/fixtures/stress/legacy/restaurantops/src/pages/Inventory.tsx`  
  `4f30768f508fa6ad4e302740047a253c0272bcdfce397c0add7620feade91cf6`
- `benchmarks/fixtures/stress/legacy/restaurantops/src/pages/KitchenQueue.tsx`  
  `e777efdaee8f7480c53aa90f187fdc6a53c16ff290c445a82aea8380527c2b08`
- `benchmarks/fixtures/stress/legacy/restaurantops/src/pages/MenuItems.tsx`  
  `ba19c9ae91acc3e44e0c8866f92690e028053be5eb606300d513f023f954ff75`
- `benchmarks/fixtures/stress/legacy/restaurantops/src/pages/Orders.tsx`  
  `24b87dd9a46f87d85ed20425fc10b24762a62ed9de8c7aef57632b30d1fa8e59`
- `benchmarks/fixtures/stress/legacy/restaurantops/src/pages/Reports.tsx`  
  `520136df2594f3edd12d625c0907f5d967c7133db09a4ecb54916ba87d3e9a33`
- `benchmarks/fixtures/stress/legacy/restaurantops/src/pages/Reservations.tsx`  
  `65747e973a23e62d9c68e9e32851a7a81da2b782467d784c6e060e7c8fc0953a`
- `benchmarks/fixtures/stress/legacy/restaurantops/src/pages/Staff.tsx`  
  `8682b72adf7afc18e8ffaf878a4dba69477f8a201cf909c943c70d0280661894`
- `benchmarks/fixtures/stress/legacy/restaurantops/src/pages/Tables.tsx`  
  `d5d311e01e34e762d4674445cb21f976df222fea0ab14ed46452cb860107877c`
- `benchmarks/fixtures/stress/legacy/restaurantops/src/vite-env.d.ts`  
  `65996936fbb042915f7b74a200fcdde7e410f32a669b1ab9597cfaa4b0faddb5`
- `benchmarks/fixtures/stress/legacy/restaurantops/tsconfig.json`  
  `53cedb29c7cdd97965dfc9d4d192a7f2567d97fba95c14c942effd1817d02a38`
- `benchmarks/fixtures/stress/legacy/restaurantops/vite.config.ts`  
  `eca485c281977125366d4800553256e419f364984e615f75a2d2bae54f7857fd`
- `benchmarks/fixtures/stress/legacy/schoolops-portal/index.html`  
  `2782de684f0f93a26271ed2dad3ac045508cd2c7c4daffea753c48c12bb86925`
- `benchmarks/fixtures/stress/legacy/schoolops-portal/package.json`  
  `634f8acb050e9b1229fc2b3f831adb55af1c4802b41e6d8e5c8da984db07edcf`
- `benchmarks/fixtures/stress/legacy/schoolops-portal/src/App.tsx`  
  `b05f4006569ba997974d0ac3b699885458dc5053443fca40deb968e95e3c745b`
- `benchmarks/fixtures/stress/legacy/schoolops-portal/src/index.css`  
  `d4ebdf357a96b057864e12a53495b028c4ff4d4c67df681da4d08492a514659c`
- `benchmarks/fixtures/stress/legacy/schoolops-portal/src/main.tsx`  
  `acc11682711269285ad5cdca42eb3623215e9083d43b14f969389fbd55db68a3`
- `benchmarks/fixtures/stress/legacy/schoolops-portal/src/pages/Attendance.tsx`  
  `8f665c98ac41c32533d58c1228dc9c1281616af903959d956bfbc4fbba578078`
- `benchmarks/fixtures/stress/legacy/schoolops-portal/src/pages/BehaviorLogs.tsx`  
  `e356c43282544a92c71bd33fb2163fee9cb509a27d8ade87c57d4178bc9693a9`
- `benchmarks/fixtures/stress/legacy/schoolops-portal/src/pages/Classes.tsx`  
  `56981c1cacefb44e25c7e27e17edea3fc1c943ef01bd1054496c29f8a2c60f8c`
- `benchmarks/fixtures/stress/legacy/schoolops-portal/src/pages/Dashboard.tsx`  
  `1e4131a447beefce13afed692aa739db1b57c954b6385e91f25cdf29eab400a6`
- `benchmarks/fixtures/stress/legacy/schoolops-portal/src/pages/Grades.tsx`  
  `4f0463c3d53a394ece93f4abe1bc64bb7ba5dac6a6c44ca5bed3d98cdcb209ff`
- `benchmarks/fixtures/stress/legacy/schoolops-portal/src/pages/ParentContacts.tsx`  
  `32853feb38d83595e4e66b901407e4c7f817d23620746c4c9102d61454d5ad79`
- `benchmarks/fixtures/stress/legacy/schoolops-portal/src/pages/Reports.tsx`  
  `fe52796bb7c720de3097c028c62fab1ae07cb9643d8ea4909e4359dbc990dda4`
- `benchmarks/fixtures/stress/legacy/schoolops-portal/src/pages/Settings.tsx`  
  `d623391688d8f81cc51240e9815089ea089cb8996e50e98cee263ea3d68654be`
- `benchmarks/fixtures/stress/legacy/schoolops-portal/src/pages/Students.tsx`  
  `2d3d6b9756a7f4fc752227e2d0111139456fe8507ab4347b4789f15ccf79261e`
- `benchmarks/fixtures/stress/legacy/schoolops-portal/src/pages/Teachers.tsx`  
  `39561a2e97ff54b7589f078478adc96d86e57ee3369433cc8e444f3e1f1bc791`
- `benchmarks/fixtures/stress/legacy/schoolops-portal/src/vite-env.d.ts`  
  `65996936fbb042915f7b74a200fcdde7e410f32a669b1ab9597cfaa4b0faddb5`
- `benchmarks/fixtures/stress/legacy/schoolops-portal/tsconfig.json`  
  `53cedb29c7cdd97965dfc9d4d192a7f2567d97fba95c14c942effd1817d02a38`
- `benchmarks/fixtures/stress/legacy/schoolops-portal/vite.config.ts`  
  `eca485c281977125366d4800553256e419f364984e615f75a2d2bae54f7857fd`
- `benchmarks/fixtures/stress/replay-frozen/fleetops-pro/index.html`  
  `fd6242f11c8a2ea1e71db1c994718dcf83b0cd2ecdfc8ebb0251d5e3946b608c`
- `benchmarks/fixtures/stress/replay-frozen/fleetops-pro/package.json`  
  `c778be95c7ebb6342121187531bd083771075310116b758686ed652f352f41d1`
- `benchmarks/fixtures/stress/replay-frozen/fleetops-pro/src/App.tsx`  
  `e880f90616054711fcd881ac243b45b7854beb8ea0d08849ee00747c956e1c81`
- `benchmarks/fixtures/stress/replay-frozen/fleetops-pro/src/index.css`  
  `d4ebdf357a96b057864e12a53495b028c4ff4d4c67df681da4d08492a514659c`
- `benchmarks/fixtures/stress/replay-frozen/fleetops-pro/src/main.tsx`  
  `acc11682711269285ad5cdca42eb3623215e9083d43b14f969389fbd55db68a3`
- `benchmarks/fixtures/stress/replay-frozen/fleetops-pro/src/pages/Dashboard.tsx`  
  `be1fbe7655dda982596b53bfeed22cf3d9a3023b2e2f233d46dcad2906f8cd41`
- `benchmarks/fixtures/stress/replay-frozen/fleetops-pro/src/pages/Dispatch.tsx`  
  `feedbcb1b68850f36747562e89d09d542a7f1e0241a4b7d8ceef280d6955f80d`
- `benchmarks/fixtures/stress/replay-frozen/fleetops-pro/src/pages/Drivers.tsx`  
  `e7ce1e99361cdb8b62c58dd01aaf3dae51316879f647483578e58a7cc7bb7500`
- `benchmarks/fixtures/stress/replay-frozen/fleetops-pro/src/pages/FuelLogs.tsx`  
  `ccef803fa0f205263525e5df7a1537f79474dda71672909b47aa0e3fd4b2e401`
- `benchmarks/fixtures/stress/replay-frozen/fleetops-pro/src/pages/Inspections.tsx`  
  `9aeaef29de4e700d85bf287ec42a777f089c5cc6be850ae89e301136fef573a6`
- `benchmarks/fixtures/stress/replay-frozen/fleetops-pro/src/pages/Maintenance.tsx`  
  `8d9e2c97e35a75d9dcd660c4758d86db27e3cdd229911dc674edde567886120a`
- `benchmarks/fixtures/stress/replay-frozen/fleetops-pro/src/pages/Reports.tsx`  
  `d1f84b4e2fb21687bf4065df8e25ff6a832681ff5f99213d9be180614357d456`
- `benchmarks/fixtures/stress/replay-frozen/fleetops-pro/src/pages/Settings.tsx`  
  `97a0992d3cb0867ea5c01a7e05800eb66bb962db91c63e8fb17b8e6fa8dd41b1`
- `benchmarks/fixtures/stress/replay-frozen/fleetops-pro/src/pages/Vehicles.tsx`  
  `e12bf0e8066b374864c0bfe74175f9471ad846a4cc27af455bd733baada800db`
- `benchmarks/fixtures/stress/replay-frozen/fleetops-pro/src/vite-env.d.ts`  
  `65996936fbb042915f7b74a200fcdde7e410f32a669b1ab9597cfaa4b0faddb5`
- `benchmarks/fixtures/stress/replay-frozen/fleetops-pro/tsconfig.json`  
  `53cedb29c7cdd97965dfc9d4d192a7f2567d97fba95c14c942effd1817d02a38`
- `benchmarks/fixtures/stress/replay-frozen/fleetops-pro/vite.config.ts`  
  `eca485c281977125366d4800553256e419f364984e615f75a2d2bae54f7857fd`
- `benchmarks/fixtures/stress/replay-frozen/inventory-command/index.html`  
  `62ac8e2f0d3b7d1d453c382ac8fa96ed0f83dff42d36222f778bcafd092c0e01`
- `benchmarks/fixtures/stress/replay-frozen/inventory-command/package.json`  
  `4407155c73968cca2972e5096ac6f8cb48c7638cf6711e24443c194a83719edd`
- `benchmarks/fixtures/stress/replay-frozen/inventory-command/src/App.tsx`  
  `b649285b10e9762a0c0cc8aa46b40b0a99f0d3b4205510f4692f5e2d448e44cf`
- `benchmarks/fixtures/stress/replay-frozen/inventory-command/src/index.css`  
  `d4ebdf357a96b057864e12a53495b028c4ff4d4c67df681da4d08492a514659c`
- `benchmarks/fixtures/stress/replay-frozen/inventory-command/src/main.tsx`  
  `acc11682711269285ad5cdca42eb3623215e9083d43b14f969389fbd55db68a3`
- `benchmarks/fixtures/stress/replay-frozen/inventory-command/src/pages/Alerts.tsx`  
  `36481bf348566f241ea701f3c542b4367b7eb504faaf2f875128918798b00aa5`
- `benchmarks/fixtures/stress/replay-frozen/inventory-command/src/pages/Dashboard.tsx`  
  `709520f078dceb1cd1b3025749f6e673b81f6ce377fd4ab6f20a36ced7e638e9`
- `benchmarks/fixtures/stress/replay-frozen/inventory-command/src/pages/Products.tsx`  
  `14908816df311e2c34ab3ab90e30fafa393fcc7838be1ea2fcb86b59c19b0c19`
- `benchmarks/fixtures/stress/replay-frozen/inventory-command/src/pages/PurchaseOrders.tsx`  
  `586007f9ea336c2158c82dbac5e629ed2cbeabec5293f9713d1e865830d33097`
- `benchmarks/fixtures/stress/replay-frozen/inventory-command/src/pages/Reports.tsx`  
  `7c2f62fcb32390f09f3cd778da272246023292c99d94e9e632fc2c20d75df5ac`
- `benchmarks/fixtures/stress/replay-frozen/inventory-command/src/pages/Settings.tsx`  
  `9c0ad646310975e13491a64bb868546d67c1437b111e33f38c43b9b2498fbb89`
- `benchmarks/fixtures/stress/replay-frozen/inventory-command/src/pages/StockMovements.tsx`  
  `92fd95a775a5b877eef1c4be8a6c722bd4da8b6e82cbaf3cdbf9e91c8447b3ab`
- `benchmarks/fixtures/stress/replay-frozen/inventory-command/src/pages/Suppliers.tsx`  
  `262ee32c523c78b06ddd45582c636694350b58a6cc731257744a2810ec283262`
- `benchmarks/fixtures/stress/replay-frozen/inventory-command/src/vite-env.d.ts`  
  `65996936fbb042915f7b74a200fcdde7e410f32a669b1ab9597cfaa4b0faddb5`
- `benchmarks/fixtures/stress/replay-frozen/inventory-command/tsconfig.json`  
  `53cedb29c7cdd97965dfc9d4d192a7f2567d97fba95c14c942effd1817d02a38`
- `benchmarks/fixtures/stress/replay-frozen/inventory-command/vite.config.ts`  
  `eca485c281977125366d4800553256e419f364984e615f75a2d2bae54f7857fd`
- `benchmarks/fixtures/stress/replay-frozen/legalcase-vault/index.html`  
  `cf3854cdf8b1e590da57186444fc76f2769c4df0a4ce78a14f506f2017970577`
- `benchmarks/fixtures/stress/replay-frozen/legalcase-vault/package.json`  
  `ed3604bb9cce5d18c2c6f70a5d14cf3ad9b4986ca13be28c4463bc43f200c455`
- `benchmarks/fixtures/stress/replay-frozen/legalcase-vault/src/App.tsx`  
  `5b8a843c0de72da463920f0b9ddbf1c212ac76e2637f9ccfc5657d5c0a0d85fb`
- `benchmarks/fixtures/stress/replay-frozen/legalcase-vault/src/index.css`  
  `d4ebdf357a96b057864e12a53495b028c4ff4d4c67df681da4d08492a514659c`
- `benchmarks/fixtures/stress/replay-frozen/legalcase-vault/src/main.tsx`  
  `acc11682711269285ad5cdca42eb3623215e9083d43b14f969389fbd55db68a3`
- `benchmarks/fixtures/stress/replay-frozen/legalcase-vault/src/pages/Cases.tsx`  
  `aa492423f1de911cb5d72575e0576df40ccf7175ddb365529369f84dadd65e80`
- `benchmarks/fixtures/stress/replay-frozen/legalcase-vault/src/pages/Clients.tsx`  
  `5d66b4a63fdc42e0668670aa7478045e157020384d7dbf4f3a8856c7f5f71aff`
- `benchmarks/fixtures/stress/replay-frozen/legalcase-vault/src/pages/Dashboard.tsx`  
  `6df8ea32407015cb437de66c0e88c08fb52fe374eb2f8ba82d67be9000a70b4b`
- `benchmarks/fixtures/stress/replay-frozen/legalcase-vault/src/pages/Deadlines.tsx`  
  `cd3273cbfd2014504c22c63c88bb17e26a3ce3b3df22cb2f08390ecf5120a17a`
- `benchmarks/fixtures/stress/replay-frozen/legalcase-vault/src/pages/Documents.tsx`  
  `1ad657b379195e1adc8a5c906d4a7600ed51bc2e95638f6355a46b9ea2d82931`
- `benchmarks/fixtures/stress/replay-frozen/legalcase-vault/src/pages/Evidence.tsx`  
  `14959dbbf039050680f0e965bd114c9ac097d2629f6aab967c313b49de7abd8f`
- `benchmarks/fixtures/stress/replay-frozen/legalcase-vault/src/pages/Hearings.tsx`  
  `faf6d0291f5468ed78b3576a1aaaad9631972dc032f1c920ebcb30c9babbbcd8`
- `benchmarks/fixtures/stress/replay-frozen/legalcase-vault/src/pages/Notes.tsx`  
  `4b087e65ee3d0d14550142f326851b6864b6a8daf8047ab22d618688ae9d4388`
- `benchmarks/fixtures/stress/replay-frozen/legalcase-vault/src/pages/Reports.tsx`  
  `a77ae1f8e6f31975831956663bdab6bece6d207c9f89b4dd0800f09ddc598fc7`
- `benchmarks/fixtures/stress/replay-frozen/legalcase-vault/src/vite-env.d.ts`  
  `65996936fbb042915f7b74a200fcdde7e410f32a669b1ab9597cfaa4b0faddb5`
- `benchmarks/fixtures/stress/replay-frozen/legalcase-vault/tsconfig.json`  
  `53cedb29c7cdd97965dfc9d4d192a7f2567d97fba95c14c942effd1817d02a38`
- `benchmarks/fixtures/stress/replay-frozen/legalcase-vault/vite.config.ts`  
  `eca485c281977125366d4800553256e419f364984e615f75a2d2bae54f7857fd`
- `benchmarks/fixtures/stress/replay-frozen/medtrack-clinic/index.html`  
  `0ebd164a364340e3c7350c3baf3436ebc47d12b4e2a807601f78abbb3dc07e30`
- `benchmarks/fixtures/stress/replay-frozen/medtrack-clinic/package.json`  
  `4d4ee77b8e45f65030015cf9419f0dda2d7a4d96f9da060fcc06e8f26c126a7c`
- `benchmarks/fixtures/stress/replay-frozen/medtrack-clinic/src/App.tsx`  
  `91e3c7c65d3b0992b3cfab2ffbb7c86ac2b0d06c6031b5229a7c862fc3ad1bfb`
- `benchmarks/fixtures/stress/replay-frozen/medtrack-clinic/src/index.css`  
  `d4ebdf357a96b057864e12a53495b028c4ff4d4c67df681da4d08492a514659c`
- `benchmarks/fixtures/stress/replay-frozen/medtrack-clinic/src/main.tsx`  
  `acc11682711269285ad5cdca42eb3623215e9083d43b14f969389fbd55db68a3`
- `benchmarks/fixtures/stress/replay-frozen/medtrack-clinic/src/pages/Appointments.tsx`  
  `60283a7ec06d785d24546932b4db444af92f644d1615bf283c0f44d873dba7c0`
- `benchmarks/fixtures/stress/replay-frozen/medtrack-clinic/src/pages/Billing.tsx`  
  `4f1094383712e8cb9d479df23c1438c370c1db92d73b64b9dce2e0ac9a717efd`
- `benchmarks/fixtures/stress/replay-frozen/medtrack-clinic/src/pages/Dashboard.tsx`  
  `09e088583ebfc7f5a70fe6872b88ae78c27fec7fb418252e8f4e5f71e8890e56`
- `benchmarks/fixtures/stress/replay-frozen/medtrack-clinic/src/pages/Patients.tsx`  
  `9d2a58c4f8d2ac0c4463c1b17e6275769bfb493729edbe48a65c34436858a0e2`
- `benchmarks/fixtures/stress/replay-frozen/medtrack-clinic/src/pages/Prescriptions.tsx`  
  `6d9c102e88910a1f1a2111f50d60fa4cab27d63af3f633a5257f95eef7c4519c`
- `benchmarks/fixtures/stress/replay-frozen/medtrack-clinic/src/pages/Providers.tsx`  
  `733a8125b0334a51bbfbdfbb0337a4bc5198fa0420b14f220333bb4772ef2c88`
- `benchmarks/fixtures/stress/replay-frozen/medtrack-clinic/src/pages/Reports.tsx`  
  `6a251849cd026485f62c6320d417fa214e272ec104609ea0f49438880433f124`
- `benchmarks/fixtures/stress/replay-frozen/medtrack-clinic/src/pages/VisitNotes.tsx`  
  `226abaecca1347ac3ce0d6652d630f868ca595a566592c5495aefd7df8b66bff`
- `benchmarks/fixtures/stress/replay-frozen/medtrack-clinic/src/vite-env.d.ts`  
  `65996936fbb042915f7b74a200fcdde7e410f32a669b1ab9597cfaa4b0faddb5`
- `benchmarks/fixtures/stress/replay-frozen/medtrack-clinic/tsconfig.json`  
  `53cedb29c7cdd97965dfc9d4d192a7f2567d97fba95c14c942effd1817d02a38`
- `benchmarks/fixtures/stress/replay-frozen/medtrack-clinic/vite.config.ts`  
  `eca485c281977125366d4800553256e419f364984e615f75a2d2bae54f7857fd`
- `benchmarks/fixtures/stress/replay-frozen/schoolops-portal/index.html`  
  `2782de684f0f93a26271ed2dad3ac045508cd2c7c4daffea753c48c12bb86925`
- `benchmarks/fixtures/stress/replay-frozen/schoolops-portal/package.json`  
  `634f8acb050e9b1229fc2b3f831adb55af1c4802b41e6d8e5c8da984db07edcf`
- `benchmarks/fixtures/stress/replay-frozen/schoolops-portal/src/App.tsx`  
  `b05f4006569ba997974d0ac3b699885458dc5053443fca40deb968e95e3c745b`
- `benchmarks/fixtures/stress/replay-frozen/schoolops-portal/src/index.css`  
  `d4ebdf357a96b057864e12a53495b028c4ff4d4c67df681da4d08492a514659c`
- `benchmarks/fixtures/stress/replay-frozen/schoolops-portal/src/main.tsx`  
  `acc11682711269285ad5cdca42eb3623215e9083d43b14f969389fbd55db68a3`
- `benchmarks/fixtures/stress/replay-frozen/schoolops-portal/src/pages/Attendance.tsx`  
  `8f665c98ac41c32533d58c1228dc9c1281616af903959d956bfbc4fbba578078`
- `benchmarks/fixtures/stress/replay-frozen/schoolops-portal/src/pages/BehaviorLogs.tsx`  
  `e356c43282544a92c71bd33fb2163fee9cb509a27d8ade87c57d4178bc9693a9`
- `benchmarks/fixtures/stress/replay-frozen/schoolops-portal/src/pages/Classes.tsx`  
  `56981c1cacefb44e25c7e27e17edea3fc1c943ef01bd1054496c29f8a2c60f8c`
- `benchmarks/fixtures/stress/replay-frozen/schoolops-portal/src/pages/Dashboard.tsx`  
  `1e4131a447beefce13afed692aa739db1b57c954b6385e91f25cdf29eab400a6`
- `benchmarks/fixtures/stress/replay-frozen/schoolops-portal/src/pages/Grades.tsx`  
  `4f0463c3d53a394ece93f4abe1bc64bb7ba5dac6a6c44ca5bed3d98cdcb209ff`
- `benchmarks/fixtures/stress/replay-frozen/schoolops-portal/src/pages/ParentContacts.tsx`  
  `32853feb38d83595e4e66b901407e4c7f817d23620746c4c9102d61454d5ad79`
- `benchmarks/fixtures/stress/replay-frozen/schoolops-portal/src/pages/Reports.tsx`  
  `fe52796bb7c720de3097c028c62fab1ae07cb9643d8ea4909e4359dbc990dda4`
- `benchmarks/fixtures/stress/replay-frozen/schoolops-portal/src/pages/Settings.tsx`  
  `d623391688d8f81cc51240e9815089ea089cb8996e50e98cee263ea3d68654be`
- `benchmarks/fixtures/stress/replay-frozen/schoolops-portal/src/pages/Students.tsx`  
  `2d3d6b9756a7f4fc752227e2d0111139456fe8507ab4347b4789f15ccf79261e`
- `benchmarks/fixtures/stress/replay-frozen/schoolops-portal/src/pages/Teachers.tsx`  
  `39561a2e97ff54b7589f078478adc96d86e57ee3369433cc8e444f3e1f1bc791`
- `benchmarks/fixtures/stress/replay-frozen/schoolops-portal/src/vite-env.d.ts`  
  `65996936fbb042915f7b74a200fcdde7e410f32a669b1ab9597cfaa4b0faddb5`
- `benchmarks/fixtures/stress/replay-frozen/schoolops-portal/tsconfig.json`  
  `53cedb29c7cdd97965dfc9d4d192a7f2567d97fba95c14c942effd1817d02a38`
- `benchmarks/fixtures/stress/replay-frozen/schoolops-portal/vite.config.ts`  
  `eca485c281977125366d4800553256e419f364984e615f75a2d2bae54f7857fd`


## What this does not do

- Does not set inventory `verified` or a structured `evidence_reference` other than `none`
- Does not prove authenticity of any off-Git object
- Does not conclude copyright ownership or legal authorship of the replacement
- Does not claim non-infringement, license grant, or external-release clearance
- Does not replace `e2e/fixtures/**` or other non-stress fixture groups
