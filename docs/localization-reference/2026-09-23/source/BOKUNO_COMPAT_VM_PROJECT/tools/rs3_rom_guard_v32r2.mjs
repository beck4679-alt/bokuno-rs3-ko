/** Pinned ROM identities. No unrestricted ROM guard bypass. */
import {createHash} from 'node:crypto';
export const BASE_ROM_SHA='68a42e5373b856788f9c71c12f5c9aab036c826316278af1780403514ffc5941';
// 2026-09-12 isolated candidates: exact ROM/arena/relocation proofs and
// deterministic rebuild recorded in BOKUNO_SHARED_PADDING_REPAIR_20260912.md.
// The caller must additionally validate the installed adaptive helper contract.
export const PADDING_V3_ROM_SHA='499347b7513c7bc7c329a8ecfdfbfa192e11909c9b2886b176615eb84bc14c56';
// Isolated residue_v2: 91 intended text/layout edits, 23,544 allocations
// unchanged; exact padding/installed-ROM and source/BACK proofs passed.
export const RESIDUE_V2_ROM_SHA='8ebe4461c92268bfc1965d93a1707c5691d3bddb01dcfbf57d010efbd1249a67';
// Isolated residue_v4: residue_v3 text/layout set plus the CPU-tested exact
// three-row conditional-leading-space wrapper at FE:9500.
export const RESIDUE_V4_ROM_SHA='cc6f7ce7d8e535287f9011d4dcd3207ebee5ccdf0e03c1c17016e2febf91e68b';
// residue_v6: exact 155-source whitespace/layout proof and installed helper
// reconstruction passed; isolated candidate for full caller regression.
export const RESIDUE_V6_ROM_SHA='3d9de785c8f83afb2e381d3bf843f59341b379f511a4a972247ca588d4a6e152';
// residue_v7 restores 3A102B's original balanced allocation; all other v6
// text/control payloads preserved by the exact intended-change proof.
export const RESIDUE_V7_ROM_SHA='c1134abeb7bb01d41e310516877e8a5f28d0687a469a1c74af3884577b6e2241';
// residue_v10: exact 176-source proof, including 22 source-owned post-padding
// blank removals; native boundary ownership and existing FE carriers preserved.
export const RESIDUE_V10_ROM_SHA='b345f86c3197c814050a51f679896f1638d5e180badb2d4f91367202141633bc';
export const FLOW_V8_ROM_SHA='ecef80f8d30e021264a2d291ff9a406707f8b0c1ccb4d83a925453b8d31dc681';
export const Z98_ROM_SHA='02ae4ae27686875480ab14b31d63e65a9ce282813c3b7015f70ac5f8acb5d9c2';
export const Z97_ROM_SHA='c9b571dbed574d79c5de93f1d1016268d0bad1647f9eaf5466f16a9cb8b4169f';
export const Z96_ROM_SHA='6868aac8c03db05ad09bdb6645804c7f0d6c7b249685b00e37f5494066f1b987';
export const Z65_ROM_SHA='8182f890e38d43df746cbbdc07d9aba28177cb5c397bd3be19f8cb95c7afb48b';
export const REPAIRED_ROM_SHA='93e548ba6a62001aa8922c118afdfaf7dcb128e629924281793ff97c20aecade';
// 2026-09-08: 우리 안전 빌드 후보도 핀에 올린다(z66 = z65 글리프 감사 24건 수리, z67 = 배치 결함 일괄 처방 92건). 핀 방식은 유지 — 임의 롬 우회 없음.
export const Z66_ROM_SHA='0cec8746cd6d862f9e9cafb343a0eda533d4e8a1219a63b636f4cc81e816a1b6';
export const Z68_ROM_SHA='ebd2f62938fc599dd63b5b300dc6e24dacad6fa6c3aa36cd1c4c75d975447b32';
export const Z69_ROM_SHA='439e3f821951e139b42e56821c000c5e2efd28ddbf9e389b58f381eab36d2644';
export const Z70_ROM_SHA='a9a4949bbb31001f43aa8b0d0633c15ce9173b5aa5553ec302f9e6b738b08515';
export const Z71_ROM_SHA='5c51d76ddf92e4af7d5ea351eb3cb7255878f3aefd5ba7e39ab30333c72813e3';
export const Z72_ROM_SHA='b480a2edeeff0985c87c0df751e803e610e3358a7e25bc8411a485c3352a753d';
export const Z73_ROM_SHA='3903793733478454b613682b2fc37dd74f2b81fa5dce45316b78aea9ae518fe3';
export const Z74_ROM_SHA='66e6d54b494771f103859bc22c187df61e14fe458322822c562cf05896c91071';
export const Z75_ROM_SHA='102408dbb169ac1a73c3ab862798812532c130d8a9015e8c2c926585236b1c0b';
export const Z76_ROM_SHA='87cd3738df2ef00954bb77f8c463d45e2dc826ca6b06c030bdf0645d9406164b';
export const Z77_ROM_SHA='08798c64bd840234ecae88ed5ffd84d4ecb829a80e8133036794f275483ae261';
export const Z78_ROM_SHA='3e08d85cf295dbc8ff00f72ebc565b5f80055788a68ba0370034087746571fe5';
export const Z79_ROM_SHA='657912c82d7ccb0d649097d60ab54034396a9a65fedfe64881f7a54a8be61b36';
export const Z81_ROM_SHA='d47bf3ea6e1d8fece86d4930e3135d67daacea9f9b44ee7e013dde8a4e8e215c';
export const Z80_ROM_SHA='86c34c621c7ae19b7a9f47a0b3063bb245a73f4c19744e48453903891f65fa26';
export const Z85_ROM_SHA='fcc79b5eebebd8536be4a66a63f015fa465eded963ad933ba0e899f0e192d6d1';
export const Z91_ROM_SHA='54b8f50a8f58f1a2ecd04d71268b59d62133e47a2d6795cd475327d2eca58878';
export const Z92_ROM_SHA='0f5d547a43126818bdef995c2035ea8543d24cf3f618fe2e1034b42ea3aaaab2';
export const Z93_ROM_SHA='1bd5dc26de775f2198b600980c468691ccffb9117826ceedc2d6794086fa9536';
export const Z95_ROM_SHA='cb9fdd344287a59e9b91f4f15b3742562bed97f96b249750f5a29c6b9fa4df08';
export const Z94_ROM_SHA='77dab8fe24b887b2b493b84c8d5fcfad74046ad516f3a72fabd65c52c0ed0a6c';
export const Z90_ROM_SHA='eabe19b88ed12bccd480020567fa404a1542ebe7f9801003c93bf73a94aa4193';
export const Z89_ROM_SHA='d15108fcc895aa2dbe69d3d8b3d9db1d4ab24e116467d32d4e81da0c2aebbcb7';
export const Z88_ROM_SHA='7595e9e35922a13af070be383f5c243657970af50f8304adf41294d57720b375';
export const Z87_ROM_SHA='75284054e5643ebb13fd75e54940c5cdaf09f9411481414f2a3faa0aa671c4ae';
export const Z86_ROM_SHA='3c73250b2e215b5cf13c2a1ece4b1dd0c66544b1b4396aa4d3636fd5b81d1b28';
export const Z67_ROM_SHA='f47e821ea21a06f6761ef8f7c052a0bf013b3409919aad4e9ce813d4399ab6d4';
// v12: 205 exact source edits plus six authenticated conditional blank heads.
export const RESIDUE_V12_ROM_SHA='3d34f1b4723ed8667945cc7fffb26b3d8c1ae6a36372dfaca3a41000598a82ab';
// v13: exact 213-source text proof and installed seven-row conditional helper.
export const RESIDUE_V13_ROM_SHA='2a1c9035204a5ef0571a0a324e335d6039b3813d8ec38d5b4e30cbf38628ba16';
// v14: exact 217-source text proof, four additional source-owned layout repairs.
export const RESIDUE_V14_ROM_SHA='4dd26838a2f244d40e58e4dcfe91a7b25f58e8b9269b1119ec55c4a4c1f62641';
// v15: exact same 217-source set; shared 45831D wrap protected by 458159 boundary.
export const RESIDUE_V15_ROM_SHA='9ed9e7bd181dfee3f91c08e2ef96df7080a42c4a7105f6b9a202a18d62a417ff';
// v16: two exact menu-marker repairs; native source/BACK and all other payloads verified.
export const RESIDUE_V16_ROM_SHA='e64dd6059223971692c5a629c9f2fbf7e22b2925b9596c06464a516aa75551a7';
export const RESIDUE_V17_ROM_SHA='d8b2c166290ef59abec0fb8700dfdd86557cac0158882382ace2d31651496945';
export const RESIDUE_V18_ROM_SHA='3119d6a0c235776de2b1178b77fff8b8a2de3d044eefade209c8c4475b507bb6';
// Contextual v1: exact 493-byte overlay + independent whole-ROM and CPU ABI proof.
export const CONTEXTUAL_V1_ROM_SHA='2d7f14a8df22af8aded0cd3afc9085a533d32d74b78e53e544da02cfe0634ad7';
export const CONTEXTUAL_V2_ROM_SHA='4c972c3eec255eb7debd7a4bca1c78c7ef67036583c3839efa852aa2efed6de2';
// 89 reviewed variants: independent 2,034-byte proof, CPU dispatcher and native selector tests passed.
export const REMAINING_GRAMMAR_V1_ROM_SHA='a78e9cc3227b2e989d8dc4280731e2142eb2d1e1b5196a72b00398591e44b7d0';
export const FULL_AUDIT_LITERALS_V1_ROM_SHA='ffaf2b274e7b502bee354ddf3337f3ef5b6cf9026b3981b5d342b377d305b107';
export const PREFIX_SEPARATOR_V3_ROM_SHA='15bf449ed8c078fef802b6c1b210ee14ce490fb3b0571b1baaf99bcbdef98e97';
// Prefix-v3 plus six byte-proven source-global literal routes. Prefix helper
// and all 138 parent payloads remain byte-identical.
export const CONTEXTUAL_V4_ROM_SHA='4cc2310e58ee06c09c4ceb214a40dbb2621f329376839ece018c0060cc15b658';
export const CONTEXTUAL_V4R2_ROM_SHA='b03495ee03dd978000fe2c22d8d6a07aa2afb5f898782d308f7d1f728624a7fa';
export const SPACING_FINAL_V1_ROM_SHA='02eca18b501bc2163947c9f2ab25d3a99f88e6d61ea2ce7f0a6a994e2263d1c7'; // exact 390-byte helper bundle and gate proof
export const CONTEXTUAL_V4R3_ROM_SHA='936c3b8b00cb16952130fac2297417a86dca30130f325fa48a20972137d56d70';
export const SPACING_FINAL_V2_ROM_SHA='aa4283d15ed343680d448de39a451bc6ab5334ebacee5d0f5f237fe4f909fc5e'; // strict-fit helper + exact 159-entry/3-byte literal proofs
export const CONTEXTUAL_V4R4_ROM_SHA='3944e38338ca29b82adbc2248e761041046577e7e3e41b0e471f4fce497abe42'; // exact 163-entry proof; four source-owned separators
export const SPACING_FINAL_V3_ROM_SHA='12097d558f00d12300cbb0c48179ed8e92e2e0ec46c20b0ea00077bbe006ecba'; // byte-proven five exact heads + strict soft chain
export const CONTEXTUAL_V4R5_ROM_SHA='f93c40b341928179b1fb08f688be6a5fa6640553861f023f838ccfa779f2cb6d'; // exact 166-entry parent, three terminal padding removals
export const SPACING_FINAL_V4_ROM_SHA='bb93cbb5efb2e3c616e4134a41427ddaf5b6996b29e9b3270c27d37ea42ce8cc'; // byte-proven five-head and 36-row strict-soft chain
export function assertSupportedRom(rom,label='ROM') {
  const digest=createHash('sha256').update(rom).digest('hex');
  // 2026-09-15 ROM-stage DIAGNOSTICS of the formal builder (not candidates, no replay/31 seeds): pinned only so the M8 walker can run the native end16 guard regression.
  if(rom.length===8388608&&digest==='c107f64f02797b010c43e02632ceadebc4cbba8ef24a8db35092fd2389d937c9')return digest; // qc_romdiag_20260914_v2: formal C2 generators, end16 guard absent (baseline)
  if(rom.length===8388608&&digest==='22036da9c714672bb326c435e5be51aebe1072020a32ae1b20df8b4a888edd40')return digest; // qc_romdiag_20260915_v3: formal C2 generators + native end16 guard
  if(rom.length===8388608&&digest==='8698bfcc644f136765f4380bcd473561193701dacf2c3c15582210869822cb6a')return digest; // qc_romdiag_20260915_speech_v1: speech-arms declaration 168 entries (260 contextual) -- regression only, not a candidate
  if(rom.length===8388608&&digest==='ede502a59555c6ceb2c280f5da6fbcef3553de1a2317018b8af9c1cd7b16c978')return digest; // qc_romdiag_20260915_speech_v2: speech-arms 177 entries -- regression only, not a candidate
  if(rom.length===8388608&&digest==='8f7a27405de3ad8ec7ba0375822741f36140cab2de0bd9cff6723217fcd0e3a5')return digest; // qc_romdiag_20260915_speech_v3b: speech-arms 187 entries -- regression only, not a candidate
  if(rom.length===8388608&&digest==='7dfe0d74301ea60fe97ad5f5c039e773328d10daa3ff313e22a91fa328f6786b')return digest; // qc_romdiag_20260915_speech_v4: speech-arms 187 entries + 0x0E40 stem -- regression only, not a candidate
  if(rom.length===8388608&&digest==='1429855e722fa9153ebcca5c42967403f911de167d26526c4448169aab86bcd8')return digest; // speech_arms_20260915_v2: integrated safe full build with speech-arms formal inputs -- candidate, not promoted
  if(rom.length===8388608&&digest==='5d98bfea7efb8cad91829a2d12921ef3d6860e6a5fdc8ca06bd067beee1cf00c')return digest; // qc_romdiag_20260915_speech_v5: + contextual payload carrier regions -- regression only, not a candidate
  if(rom.length===8388608&&digest==='6e9a9ef91688eb208aae832b523d642ec3ec663086d1b0cc0f90453957bcb018')return digest; // qc_romdiag_20260915_speech_v6: + speech-arm corrections + jp punctuation residue rows -- regression only, not a candidate
  if(rom.length===8388608&&digest==='e6741a6ededc50733288b6f58c32fe4d5ab987be1ec8244609cdca984e0f4916')return digest; // qc_romdiag_20260915_speech_v7: v6 + dangling-stem terminal payloads, doubled punctuation strips -- regression only, not a candidate
  if(rom.length===8388608&&digest==='c82efe7b30827277d6751a9066ad485f03303246c2af60ddfe3c05a959329a6a')return digest; // qc_romdiag_20260915_speech_v8: v7 + 0x09D2 sea-master literal wording -- regression only, not a candidate
  if(rom.length===8388608&&digest==='e6741a6ededc50733288b6f58c32fe4d5ab987be1ec8244609cdca984e0f4916')return digest; // speech_arms_20260915_v5 -- superseded by v6 (user wording), regression only
  if(rom.length===8388608&&digest==='c82efe7b30827277d6751a9066ad485f03303246c2af60ddfe3c05a959329a6a')return digest; // speech_arms_20260915_v6: integrated safe full build -- candidate, not promoted (2026-09-15)
  if(rom.length===8388608&&digest==='36f2af2a79dfb5dcc4c925dd19227f671eebeb62964c8d8c71de2e13d73f593f')return digest; // qc_romdiag_20260915_round1_v16: v6 + round1 formal inputs -- regression only, not a candidate
  if(rom.length===8388608&&digest==='da5eb30b32a87dd030670a1fccd4125602585406eeb3c2870a82ace9c963bd71')return digest; // speech_arms_20260915_v9: v8 + 3C289D three lines -- candidate, not promoted
  if(rom.length===8388608&&digest==='b93a08ff19b228a7a149041d817d44c5d099ded4c0fb76224ddcd9aacf8b75d8')return digest; // speech_arms_20260915_v10: round5 candidate, not promoted (2026-09-15)
  if(rom.length===8388608&&digest==='844a9efd9622e18a99707021b470f80a971930069a41e5d24ec11fff16403663')return digest; // speech_arms_20260915_v11: round5k candidate, not promoted (2026-09-15)
  if(rom.length===8388608&&digest==='ff1f5f9cb7aa18416dc70096439510bf67e2583adbbc5b5fa3c6a1a53a2ab3b0')return digest; // speech_arms_20260915_v12: round5l·m candidate, not promoted (2026-09-15)
  if(rom.length===8388608&&digest==='c35e0552c628989c813796cc4c6a51faca4c96ddad87fccfbc65a684e6682acd')return digest; // qc_romdiag_20260915_round4_v24: v23 + 4B false-positive reverts + 0x0845 wording -- regression only, not a candidate
  if(rom.length===8388608&&digest==='42c724ccdb6062958aa91b1804f22bd771bcf0234fb1afef1ecf0a09795b3961')return digest; // qc_romdiag_20260915_round4_v23: v22 + particle hook v4 -- regression only, not a candidate
  if(rom.length===8388608&&digest==='a634db7f6bb631164582b33996dc44fb5e785700dc9c4265844b3c9e8a1c272e')return digest; // qc_romdiag_20260915_round4_v22: v21 + 3C08F9 marker + 734301 padding -- regression only, not a candidate
  if(rom.length===8388608&&digest==='714503dc50ca95128ca3c092778f4a216287f415b3099fd127f3fcc1058d6cda')return digest; // qc_romdiag_20260915_round4_v21: v20 + head-padding hardNewlines flags -- regression only, not a candidate
  if(rom.length===8388608&&digest==='c7dbde53f2d4cf3adb25eb1d2574bb9d2961e47206dcd4df7fd7faa464d1ade2')return digest; // qc_romdiag_20260915_round4_v20: v19 + marker-row builder fix + round4 inputs -- regression only, not a candidate
  if(rom.length===8388608&&digest==='1fc8a466427acfa75b736191464fddbbfd137de5dc7722f814f44ce9ef41ef29')return digest; // qc_romdiag_20260915_round3c_v19: v18 + round3c particle hook v3 -- regression only, not a candidate
  if(rom.length===8388608&&digest==='677df1090e6d4fd413aa7a792663f4f4ef25e2921c58fe8eeaf13017ad8da838')return digest; // qc_romdiag_20260915_round3b_v18: v17 + round3b particle hook -- regression only, not a candidate
  if(rom.length===8388608&&digest==='aa3601f03412ee4a0401f0b46728b89fb62bb637b151ed64515f56dadddaf4bd')return digest; // qc_romdiag_20260915_round3_v17: v16 + round3 formal inputs -- regression only, not a candidate
  if(rom.length===8388608&&digest==='55daad94c0880622e4a660f078a37482bdc07f30d6eabaa5ae78eb56debfe38a')return digest; // exact reversible 45358E subject/modifier layer; separate native regression required
  if(rom.length===8388608&&digest==='085bc3c7b6865eb262106be2f6890f5607e0122b603e482a6bb5effda7a5a66f')return digest; // exact reversible 4425BA subject layer; bounded validation, not release approval
  // battle_popup_v1: whole-ROM independent readback + 63 native parser records;
  // existing dialogue arenas/229 contextual payloads preserved. Exact pin only.
  if(rom.length===8388608&&digest==='2f38780845c50ce9f63664204a0445c26b46e41cde26aaff7516028e8aed8079')return digest;
  if(rom.length===8388608&&digest==='a61bb273ab0516f6a06be61960efd79c9ec18c96124633832f3cf0f8e280ef64')return digest;
  if(rom.length===8388608&&digest==='73ebfdcad47eda25a4285482aff01135ea766031f2e0b36639a1d9cc146eeac8')return digest;
  if(rom.length===8388608&&digest==='769d071c1cd3efaf4a92ed50b838bdf30e83aeb23392644553df17c98c0bfa07')return digest;
  if(rom.length===8388608&&digest==='cfda148888b06eb111f9d1452d857df7cba6f12e6beeb71bcdc9e98ca3290a64')return digest;
  if(rom.length===8388608&&digest==='dc04dddba3e17e87c6e3167a18673513834eb1cb57670ac83b8838914662b07e')return digest;
  if(rom.length===8388608&&digest==='4492d19f83794b306c508cdf474cf196f0a09a4537fd4bb3b2025c351de66546')return digest;
  // 2026-09-14: exact 9-byte literal-only derivative, full parent reconstruction and control/BACK preservation verified.
  if(rom.length===8388608&&digest==='5e27a09208baa4eb11e75fd609bcda65dd1d39f9d53272bfcd347a5ac3317507')return digest;
  // Exact completion grammar derivative: two source arenas, original BACKs, five changed bytes.
  if(rom.length===8388608&&digest==='a407b7f69a74f18ffffe430b76b60dbfcf19b80dc57012efb0d05980c4433c95')return digest;
  if(rom.length===8388608&&digest==='b06bb110ca2d6859b0be84de593346d4862a93f5033cedcc036bf60476bf9f63')return digest;
  if(rom.length===8388608&&digest==='cd3e9b782f81dc6c459f7108b6b1744f5c13735d1323a101278c96bce5d97efe')return digest;
  if(rom.length===8388608&&digest==='490e5cc01f6d0cb6ccb20bcc6a68ea3414e9ff7ea3a69773a5f6e87b9543a65f')return digest;
  if(rom.length===8388608&&digest==='ce7fed0ff60f9851a6d0780263f0109a7a38f0e626abac6ef92b3ccefb31715d')return digest;
  if(rom.length===8388608&&digest==='46f5e59ef34d7019e553da0c8eee45bb846f6145d56b671f47adb7d9546c3182')return digest; // native end16 arena v5; exact reconstruction required
  if(rom.length===8388608&&digest==='37bfe18a212dec02054d0ef754e0b669b682968657bad397a69176eefce1cae0')return digest; // isolated shared sentence child; exact reconstruction required
  if(rom.length===8388608&&digest==='437be33bef5692a9056b0fc5b56917e0112f0adb086be217174687cfbd0ba8f8')return digest; // exact one-byte DD7C empty-line flush derivative; 2048 branch cases + native item PPU, not release
  if(rom.length===8388608&&digest==='808ddf7a3eed2ca061846e6e3a8ba621ce9d2dc97e7ac153da826f7ed20d3711')return digest; // isolated pool3C glyph2..4 warehouse label; exact derivative and native item PPU, not release
  if(rom.length===8388608&&digest==='26954e7b58293a70729b31479904bc03ed007ce7489e9ecfac021588e0f4562b')return digest; // local batch08 exact word-boundary and ending derivative
  if(rom.length===8388608&&digest==='3c7ef2b1d74b0884bd31ef001f8e59f6c1eeafd421d7317aa6964e0c7c924ca5')return digest; // local batch08 nine-source reversible derivative
  if(rom.length===8388608&&digest==='ae25933e5926f8f0c8f4b89d27d1245c952dd5bfc48087fd9ce9c8f670ba65ad')return digest; // exact nativeC3 records6/58/59 literal and space repair
  if(rom.length===8388608&&digest==='393ec3373c1df612650bffe4ee820833d3e4d3acee2698596b6010d3149be29c')return digest; // exact nativeC3 record235 strength glyph cells
  if(rom.length===8388608&&digest==='e5a95de7a12798afd43849fe67821b8c32ac28f3e387902c6b438f0ef3ade0b6')return digest; // exact sixteen reported-danger baseline derivatives
  if(rom.length===8388608&&digest==='c4f4044be2097de40623086fb195416e523e7a0017d8d45168516be132ad36ff')return digest; // exact caller and one-return-context join derivative
  if(rom.length===8388608&&digest==='9b857d3489a82194d7e61c3f6115a777bef6d186efcb1aa7f1635e7310dba53e')return digest; // exact two-source negative reply derivative; strict parent reconstruction
  if(rom.length===8388608&&digest==='d570cffe0679f4b84a66cdd804a1b3789cb59793a81cb39fd7cc8236c9afbad4')return digest; // exact one-source ellipsis/C6-list derivative; strict reconstruction, output proof separate
  if(rom.length===8388608&&digest==='f118d58ebdd881cdf896e1932b7d234463fabb3c876c6828d21c86676af5b431')return digest; // native menu record-end guard, strict recipe; caller proof separate
  if(rom.length===8388608&&digest==='28815654e79791b338def2fb742edd70e58215fde7e8a5e4c13d610584674c0d')return digest; // normal item3/4 space->newline only; bounded native proof separate
  if(rom.length===8388608&&digest==='3a6f11d6b9f6f620e12726c0857a4784e6810f9476b4ec364efc27ee3b8e699e')return digest; // isolated Oracle batch03 joins; strict existing-pool repartition, native output separate
  if(rom.length===8388608&&digest==='84efa427a7b42462db57e57a39345b7fc4f4033e74f52419b835faa329f78759')return digest; // isolated Oracle batch02 wording3; exact equal-byte-span derivative, layout/native verification separate
  if(rom.length===8388608&&digest==='c358bc2d92932d788b4559dc35df70c1f18d2e55df45df0c6c0f05fcd83ba99c')return digest; // four-source followup v2, shared separator rejected
  if(rom.length===8388608&&digest==='74dc12a3d1bcb58e12f8578c11e638b4d83803efa6db0a8f71187a527f1f935a')return digest; // historical rejected five-source candidate
  if(rom.length===8388608&&digest==='cb5bde65a31bddf0ffcf6f9d6932a72ee04140374796c59b38169fe132d6ccea')return digest; // guarded seven-record padding-only derivative
  if(rom.length===8388608&&digest==='95b384236fff1545f1ab07714d3da13c01a4ffa921bf2b46ad40c356a7a37159')return digest;
  // v2: exact v1 payload preservation, one Kane politeness selector, CPU227.
  if(rom.length===8388608&&digest==='544f88bf1b718ddf70dd17287d9e1630093ed422899f07fdcdf8811fe9cba85b')return digest;
  // text_integrity_v1: exact v5 reconstruction, typed provider/native BACK
  // proof v8, and all 226 installed dispatcher entries verified on native CPU.
  if(rom.length===8388608&&digest==='94973dfff8440bc9c1d74d05cc961aca326accb25fe28afbbb488e3ffe7fbfac')return digest;
  // v5: exact four authored-policy rollbacks, 162 entries and native controls
  // unchanged; regenerated native head + three ordinary word-space heads.
  if(rom.length===8388608&&digest==='d67ce1f4659faff32a74d19c9540b43cf59efae720e5bdc10de61004ffc7b517')return digest;
  if(rom.length===8388608&&digest===CONTEXTUAL_V4R4_ROM_SHA)return digest;
  if(rom.length===8388608&&digest===SPACING_FINAL_V3_ROM_SHA)return digest;
  if(rom.length===8388608&&[CONTEXTUAL_V4R5_ROM_SHA,SPACING_FINAL_V4_ROM_SHA].includes(digest))return digest;
  if (rom.length===8388608 && [CONTEXTUAL_V1_ROM_SHA,CONTEXTUAL_V2_ROM_SHA,REMAINING_GRAMMAR_V1_ROM_SHA,FULL_AUDIT_LITERALS_V1_ROM_SHA,PREFIX_SEPARATOR_V3_ROM_SHA,CONTEXTUAL_V4_ROM_SHA,CONTEXTUAL_V4R2_ROM_SHA,SPACING_FINAL_V1_ROM_SHA,CONTEXTUAL_V4R3_ROM_SHA,SPACING_FINAL_V2_ROM_SHA].includes(digest)) return digest;
  if (rom.length===8388608 && [PADDING_V3_ROM_SHA,FLOW_V8_ROM_SHA,RESIDUE_V2_ROM_SHA,RESIDUE_V4_ROM_SHA,RESIDUE_V6_ROM_SHA,RESIDUE_V7_ROM_SHA,RESIDUE_V10_ROM_SHA,RESIDUE_V12_ROM_SHA,RESIDUE_V13_ROM_SHA,RESIDUE_V14_ROM_SHA,RESIDUE_V15_ROM_SHA,RESIDUE_V16_ROM_SHA,RESIDUE_V17_ROM_SHA,RESIDUE_V18_ROM_SHA].includes(digest)) return digest;
  if(rom.length===8388608&&digest==='3d3d440f04efb530b8d23a87d61dc94c94a4c1f9706b62f905ab7800011ea87d')return digest; // jp_reference_20260915_v1: bokuno_jp.smc 사본 + 미사용 0x3FF800 그림자 디렉터리 FF->00(스크립트 바이트 불변) -- JP reference walk only, not a candidate (2026-09-15)
  if(rom.length===8388608&&digest==='30ed7c1617c8935ce131fdb5c82233a34038b1a25f6ae8ace34eae59ae329bb1')return digest; // speech_arms_20260915_v13: round5n candidate, not promoted (2026-09-15)
  if(rom.length===8388608&&digest==='3aa13fef0e830a19d2e303cc6922077b7047eacf6c312e4d5442fd97003843c7')return digest; // speech_arms_20260915_v14a: 서술격 훅 통합 기준 빌드, candidate, not promoted (2026-09-15)
  if(rom.length===8388608&&digest==='4e51632ba0700d3187e058fdbb7d7e4e6e526642dcb63904d2d57960f7144540')return digest; // speech_arms_20260915_v14b: 발화 원본 레일 1단계, candidate, not promoted (2026-09-15)
  if(rom.length===8388608&&digest==='0fe79bc6a60afa15106cd71c83734b469090a11eacdcc99b43336c156209c6df')return digest; // speech_arms_20260916_v15: 원문 말투 발화 원본 208, candidate, not promoted (2026-09-16)
  if(rom.length===8388608&&digest==='4de6692cdea0b9b289749d6ce4fe9e68829277371c7c1d1b01c8a69cf909f168')return digest; // utterances_20260917_v28: v27 + 레이아웃 m3, 전 관문 통과 — 재덤프·전체 본문 검사용, candidate, not promoted (2026-09-17)
  if(rom.length===8388608&&digest==='755dcf5525ae7fc612477091fe027b22cb30be3d2cf1d49586cc9b86c41cc8cc')return digest; // c3war_20260917_v32: v31 + C3 군단전 메시지 255 레코드, 전 관문 통과·GitHub v0.107 — 재덤프·조사 전수 검사용, candidate, not promoted (2026-09-22)
  if(rom.length===8388608&&digest==='059acaa1132d54a30ce80aee32443068620444c92ef09038b0d4340136e6f10f')return digest; // josa_20260922_v35: v32 + 일반 대사 조사 표지·전투/트레이드/C3 조사 훅·전투 조사 라벨 펜 이어 그리기, 전 관문 통과 — 재덤프·조사 전수 검사용, candidate, not promoted (2026-09-22)
  if(rom.length===8388608&&digest==='63873f97ba9db148aa0035fa54ceaa5a5a8107f75ee255767b6d120d3c240bb0')return digest; // utterances_20260917_v30: v29 + 발화 b19 v4, 전 관문 통과 — 재덤프·전체 본문 검사용, candidate, not promoted (2026-09-17)
  if(rom.length===8388608&&digest==='353477d3d614c2958119f1f2efffe7b1fc2a342ceace7d39bbc457846279725b')return digest; // utterances_20260917_v29: v28 + 발화 b19 v3·0x084E 행 수리, 전 관문 통과 — 재덤프·전체 본문 검사용, candidate, not promoted (2026-09-17)
  if(rom.length===8388608&&digest==='ef6c3a5cfacfedf22263db1ef915a860179d78c6160f23f1e84bd9446538e99a')return digest; // utterances_20260917_v27: 발화 payload b18·레이아웃 m1/m2, 전 관문 통과 — 재덤프·전체 본문 검사용, candidate, not promoted (2026-09-17)
  if(rom.length===8388608&&digest==='5775db5f15910f8c0ebf9a3560507de9c5f4710e658b70843557a8da2ea1b763')return digest; // utterances_20260917_v26: 발화 payload b16·이진 탐색 디스패처, 전 관문+실코어 PNG — 전체 본문 레이아웃 검사용, candidate, not promoted (2026-09-17)
  if(rom.length!==8388608||![BASE_ROM_SHA,REPAIRED_ROM_SHA,Z65_ROM_SHA,Z66_ROM_SHA,Z67_ROM_SHA,Z68_ROM_SHA,Z69_ROM_SHA,Z70_ROM_SHA,Z71_ROM_SHA,Z72_ROM_SHA,Z73_ROM_SHA,Z74_ROM_SHA,Z75_ROM_SHA,Z76_ROM_SHA,Z77_ROM_SHA,Z78_ROM_SHA,Z79_ROM_SHA,Z80_ROM_SHA,Z81_ROM_SHA,Z85_ROM_SHA,Z86_ROM_SHA,Z87_ROM_SHA,Z88_ROM_SHA,Z89_ROM_SHA,Z90_ROM_SHA,Z91_ROM_SHA,Z92_ROM_SHA,Z93_ROM_SHA,Z94_ROM_SHA,Z95_ROM_SHA,Z96_ROM_SHA,Z97_ROM_SHA,Z98_ROM_SHA].includes(digest))
    throw new Error(label+': unsupported ROM hash; requires exact z61/z65/z66/z67 or pinned 0E71 local repair');
  return digest;
}
