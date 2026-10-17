> 历史审查输入：本文件记录体验迭代前的问题，不代表当前实现状态。最新行为及验收见 PRODUCT_REQUIREMENTS.md 与 TEST_RESULTS.md。

Frame / AI Video Creative Studio：P0 后产品与 Demo 审查

审查日期：2026-10-18。代码基线：`620f9ca`，已推送 GitHub。本报告供 GPT Chat 讨论下一轮取舍，尚未实施下述建议。

本轮阅读源码并在本地浏览器检查了 Projects、Example Preview、Plan、Generate、New project、Activity、Analytics 等九种页面或展开状态。检查时拦截所有 API 写请求，没有提交生成、合并、评分或删除。浏览器未记录页面运行错误；三个真实镜头均成功加载。这里的“注释”指用户可见的帮助文字、技术标签和能力说明；源码注释本身不会显示在网页中。

**当前判断：P0 已形成 Brief 到 First Cut 的工程闭环，下一轮更需要统一控件含义、减少操作干扰，而不是继续加 AI 功能。** Feedback 可以简化，但它已默认折叠，优先级低于“改了却不影响生成”的字段和导出按钮层级。以下判断来自内部代码与体验审查，不是外部用户研究结论。

**1. 当前项目进度。** 产品定位为 brief-to-first-cut video workspace，用于 AIGC Product Manager Intern 作品集。

| 部分               | 已实现状态                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Plan               | Brief、可编辑分镜、Creative Direction 合并在一个页面；15 秒默认 3×5 秒，30 秒默认 5×6 秒；分镜增删、排序、单镜头重写及保存       |
| Creative Direction | 人物、产品、品牌、风格四项共享文本；参与未来生成的 Prompt；保留版本和历史快照，不保证模型一致性                                  |
| Generate & Select  | 按 Scene 展示所选版本；首次成功自动选中，后续版本不覆盖原选择；版本历史、失败重试、可选评分/反馈                                 |
| Preview & Export   | 按 Scene 顺序本地 FFmpeg 合并所选片段；展示规划与实际时长、播放、MP4 下载；选择或顺序改变后提示重建                              |
| Project            | 持久化、派生进度、Duplicate plan、JSON 导出、项目删除与关联记录/缓存清理；活动任务或构建中阻止删除                               |
| 真实接入           | Qwen 3.8 Flash 分镜 + Wan 3.0 / 480P 镜头；完整 Morning Brew Example 保存三条真实约 5 秒视频和约 15 秒 First Cut，打开不调用模型 |
| 工程               | Next.js、TypeScript、Tailwind、Prisma、SQLite、Provider Adapter、Zod、版本检查、错误处理、输入及选片快照、媒体缓存               |
| 内部工具           | Generation activity 与 Internal analytics 已放进折叠的 Workspace tools；Mock 失败模拟由开发配置控制，当前未开启                  |
| 验证               | 上一轮实际通过 70 项测试、8 条 E2E、typecheck、lint、生产 build，以及本地生产权限和重启恢复检查；本轮未重跑全套测试              |

尚未完成真实用户测试或 Railway 部署，Docker 运行未验证。没有完整时间线、转场、字幕、配乐、配音、裁切或混音功能。初剪保留原片声音并硬切，画面与声音可能不连续。其他 Provider 的协议测试不等于真实账号均已接通。

**2. 当前 use case。** 用户角色暂定为营销执行人员或社媒创作者，假设他们想先得到可审阅草稿，再只重做较弱的镜头；实际需求与使用门槛仍待验证。

创建自己的项目：

1. 填写 Brief，目前有九个必填项：品牌、产品描述、目标受众、营销目标、Creative Concept、Visual Style、目标平台、时长与画幅。
2. 进入 Plan，生成分镜；编辑 Scene 和共享 Creative Direction。当前 Brief、Scene、Direction 分别保存。
3. 在 Generate & Select 生成缺失镜头；首次成功自动成为所选版本。
4. 不满意时编辑 Scene Prompt 或共享说明并保存，再 Generate another。新结果完成后仍保留原选择，用户明确 Use this version 才替换。
5. 全部 Scene 有选片后，在 Preview & Export 点击 Build first cut，观看并导出一个 MP4。
6. 换片或调整顺序后重建初剪。评分、Feedback、Analytics、JSON 导出均不是完成这条任务的必要步骤。

打开预制示例：

Projects → Morning Brew / Example → 直接进入完整 Preview → 可回看 Plan 与所选镜头 → Export MP4。Duplicate plan 只复制规划，不复制视频；修改后的项目需要重新生成自己的片段。目前 Example 每个 Scene 只有一个真实版本，不能直接演示多版本比较与切换。

**3. 哪些可见说明影响 Demo。** 应区分常驻文字与仅在特定条件出现的说明，不宜把源码中的所有 Mock 字样都当成当前页面问题。

| 当前文案/元素                                                                                                        | 实际位置与显示条件                                                                 | 审查建议                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `STORYBOARD PLACEHOLDER`，以及图中的 `MORNING MOMENTS`                                                               | 首页项目封面、Plan 分镜图；图案固定，不跟随实际镜头或品牌                          | 最影响示例完成感。已有片段可用真实首帧；未生成时用中性占位。不能只删标签，却让固定插图冒充真实分镜图                     |
| `Shared guidance for future generations. Existing clips stay unchanged.` 与 `Prompt guidance only...not guaranteed.` | Creative Direction 同一侧栏，两处常驻说明                                          | 保留能力边界，合并成一条简短说明即可，例如 `Shared guidance for new generations. Results may vary.`；详细解释进帮助/文档 |
| `Simple cuts only...No transitions, music editing or timeline controls.`                                             | Preview 视频下方常驻长段文字                                                       | 反复列出缺失能力，会让结果页像工程说明。保留 First Cut 命名；正文缩短，声音/剪辑边界放可展开详情                         |
| `Final prompt: ... / 20000 characters`                                                                               | Plan 每个镜头默认可见                                                              | 正常状态可隐藏或移入高级 Prompt；接近上限或校验失败时再显示。不要隐藏真实错误                                            |
| `DIRECTION V2`、`5s requested`、`Generation input snapshot`                                                          | Direction 侧栏与镜头折叠详情                                                       | 有工程追溯价值，但不应抢占创作主视图；可放 Advanced / Prompt used                                                        |
| `LOCAL-FIRST STUDIO`、`Single-person workspace`、侧栏和页脚的多组口号                                                | 多页重复常驻                                                                       | 适合 README/技术介绍。正常页面保留品牌和一句任务价值即可，减少无关占位                                                   |
| `Example`                                                                                                            | 项目卡片与项目标题的小标签                                                         | 当前已很克制，建议保留。它说明内容来源，不等于 Mock                                                                      |
| `Illustrative test footage...`、开发失败模拟、API 配置/旧 BACH 说明                                                  | 仅 Mock、开发开关、缺配置或旧 Provider 时出现；当前真实 Example 主流程没有这些标签 | 不把它们误报为当前常驻问题。测试固定素材应保留简短来源；配置错误应按需出现，不能让真实调用失败变成无提示                 |
| Wan 结果链接 `expires after 24 hours; save...from Open clip`                                                         | 次级 Activity 的旧 TaskCard                                                        | 页面仍直接使用结果 URL；预制资源实际是稳定本地路径，文案对它不适用。需区分外链和已缓存媒体，避免与新存储逻辑矛盾         |
| 右下角 Next.js `N` 开发工具入口                                                                                      | 本地 dev 截图中可见，不是产品功能                                                  | 正式录屏应去掉开发指示器，或使用配置正确的生产预览；不要靠屏蔽所有错误美化演示                                           |

需要保留：明确选中状态、目标/实际时长、生成和构建进度、未保存提示、过期预览与重建提示、失败原因，以及重复付费和永久删除确认。这些信息帮助用户决定下一步，不属于应一概清除的“注释”。

**4. 哪些功能可能多余或层级不合适。**

| 功能                                         | 当前实际作用                                                                                                                 | 初步取舍                                                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 星级 + Feedback + Save review                | Project 内默认折叠；手动给单次结果评分，保存每个任务的最新评审，并供内部平均评分统计。不会用于 Prompt 优化、自动重生成或选片 | 可从正常创作界面移除，保留后台数据；若有复盘需求，可改为不强制评分的私人 Notes。不能只为了保留 Analytics 指标而要求用户打分 |
| Export project data / Export storyboard JSON | 下载两种结构化记录，不是 MP4；入口分散，项目页头的 JSON 导出比实际 MP4 更早可见                                              | 收进 More / Advanced export。完成态应突出 Export MP4，避免用户误导出 JSON                                                   |
| Rebuild first cut                            | 已有且最新的初剪也显示绿色主按钮；相同输入后端会复用已完成输出                                                               | 最新状态突出播放/Export MP4；选片改变或输出失败后再突出 Update/Rebuild。当前主 CTA 与用户完成目标不一致                     |
| Generate missing scenes                      | 所有镜头都选好时仍显示禁用按钮                                                                                               | 只在存在缺失镜头时显示，或改成完成状态提示，减少无效控件                                                                    |
| Global Activity / Internal Analytics         | 用于跨项目诊断和内部产品分析；不是广告投放成效                                                                               | 保留底层，考虑在正常 Demo 中连 Workspace tools 入口也隐藏。用户主流程没有依赖它们                                           |
| Delete project                               | 有实际数据管理价值，但在页头占据与导出、复制相近的位置                                                                       | 保留功能，移进项目菜单；删除确认及后端保护保留                                                                              |
| Duplicate plan                               | 让用户沿用示例规划，避免直接改动 Example；不复制生成结果                                                                     | 有用，保留；说明复制范围。若目标只是快速看懂结果，不能把复制设成必经步骤                                                    |
| Regenerate board                             | 全量重建 Scene；原任务记录保留，但旧 Scene 被删除、任务与旧镜头的关联清空，新 Scene 不自动继承原选片                         | 放进高级/更多操作，确认中说明对已选视频的影响；单镜头迭代优先。当前“保留历史”不等于保留可选用的镜头关联                     |
| Scene 选择、版本历史、失败重试、MP4 导出     | 支撑“只重做弱镜头”的核心任务                                                                                                 | 应保留，价值高于评分表单和技术报表                                                                                          |

Feedback 的补充问题：当前写文字后仍需打星才能保存（前后端都要求 1–5 分）。它是用户对自己片段的评审，不是发送给团队、提交给平台或反馈给模型。`Feedback` 这个名字容易产生错误预期；若继续保留，应明确谁看、何时用、会触发什么动作。

**5. 比“删注释”更优先的逻辑问题。** 这些有代码依据，不能只用更短的文案掩盖。

现有自动化测试通过，不代表所有控件都符合用户预期；下面的字段映射与跨品类默认值，尚未被此前的测试作为正确产品行为验证。

- **五个可编辑字段不直接改变视频 Prompt。** Visual Description、Subject、Camera Movement、Lighting、Mood 可以编辑保存，但 `composePrompt()` 只组合 Scene Prompt、Consistency Notes 和共享 Profile。仅改这五项后直接生成视频，不会因这些独立字段改变最终文本。完整 Scene 会进入 LLM Rewrite 的上下文，所以不是完全没用；但界面没有解释“需要 Rewrite 才可能被转写进 Prompt”。本轮内存实验逐项替换字段，确认前五项的最终 Prompt 未变。
- **通用产品仍带咖啡模板假设。** `defaultProfile()` 给所有新项目预设年轻职业人士、米色毛衣、奶油色包装、琥珀色标签、陶瓷杯和晨光，未根据非咖啡 Brief 调整。固定封面也是咖啡。Morning Brew Demo 合适，不足以证明其他产品场景成立。
- **编辑来源重叠。** Brief 的 Visual Style、共享 Visual Style、Scene Prompt、Consistency Notes 可能同时描述风格或人物。修改 Brief 不自动同步 Profile；当前组合是文本拼接，没有明确的冲突解决规则。用户不知道应该改哪个才有效。
- **保存点分散。** Save brief、Save scenes、Save direction 分开，任何未保存修改都可能阻止后续生成或选择。需要决定是否统一 Save plan，或至少指出还有哪个区域未保存；不必立即引入复杂自动保存。
- **完成页的操作层级倒置。** 最新初剪的 Rebuild 很突出，MP4 下载在长播放器下方；页头更早出现的是 JSON 导出。应先修“结果完成后最该做什么”，再考虑增加额外功能。
- **纯标题变更也使输出过期。** 输出签名包含 Scene 标题、规划时长等，改标题也要求重建，即使选择和顺序未变。需要区分规划元数据与真正影响视频的输入；改变规划时长也不会自动裁切或拉伸已有片段。
- **文档有旧流程遗留。** `USER_TESTING.md` 仍让参与者做 Mock、评分和 Analytics 任务，未覆盖选片、合并与 MP4；PRD 开头的 Value Proposition 仍偏规划/评审。进行下一轮用户测试前应对齐实际 First Cut 任务。

**6. 希望 GPT Chat 帮助判断的疑问。** 请优先给出下一轮应修的 3–5 项及验收标准，不重新设计技术架构，也不扩张为完整剪辑器。

1. 核心目标用户究竟是需要“评估视觉创意的初剪”的营销人员，还是需要可直接发布广告的小商家？当前无字幕/CTA/配乐编辑，前一种任务是否足以成立，需要如何验证？
2. 面向不熟悉 Prompt 的用户，默认编辑对象应是 Scene Description，还是当前原始 Scene Prompt？五个结构化编辑字段应自动进入最终 Prompt、经 Rewrite 转译，还是先收起？如何避免多份可编辑文本成为冲突来源？
3. 单人工作台是否需要星级和 Feedback？如果没有明确的后续动作，是删除前台评分，还是仅保留可选私人 Notes？内部 Average User Rating 是否也应随之降级？
4. 一个最小、清楚的操作层级是否应是：Plan 保存 → 生成缺失镜头/生成另一个版本 → 明确选用 → 构建/更新初剪 → Export MP4？哪些按钮只在特定状态出现？
5. 已有完整初剪后，修改标题、规划时长、Prompt 或 Creative Direction，哪些应该使输出失效，哪些只影响未来生成？应怎样解释“现有片段不会自动更新”？
6. 当前 Example 没有备用真实版本。为了展示关键的 Select/Iterate 价值，是否值得以后另行批准一个真实备用镜头，还是先通过既有录屏/讲解验证产品理解？本次审查没有新增生成请求。
7. 下一轮是否应先修有效编辑字段、去掉咖啡默认假设、使用真实封面及简化导出层级，再做少量观察式用户测试？哪些修改属于测试前必须修，哪些应留到观察后决定？
8. 如果保留内部分析，是否应将真正的项目完成行为作为后续指标？当前 `project_exported` 只表示 JSON 导出，尚无 MP4 导出漏斗，不能拿它声称 First Cut 完成率。

源码定位（用于复核事实，不是额外需求）：

- [共享默认值与 Prompt 组合](/Users/qiyongxi/lively/ai-video-creative-studio/src/lib/domain.ts:77)
- [单镜头 Rewrite 的上下文](/Users/qiyongxi/lively/ai-video-creative-studio/src/lib/providers/qwen.ts:208)
- [固定咖啡插图](/Users/qiyongxi/lively/ai-video-creative-studio/src/components/studio.tsx:79)
- [评分/Feedback 的折叠界面](/Users/qiyongxi/lively/ai-video-creative-studio/src/components/generate-select.tsx:193)
- [评分保存契约](/Users/qiyongxi/lively/ai-video-creative-studio/src/lib/service.ts:620)
- [整体重建分镜](/Users/qiyongxi/lively/ai-video-creative-studio/src/lib/service.ts:264)
- [初剪按钮与说明](/Users/qiyongxi/lively/ai-video-creative-studio/src/components/first-cut-preview.tsx:43)
- [选片签名中的标题与规划时长](/Users/qiyongxi/lively/ai-video-creative-studio/src/lib/project-state.ts:23)
- [现有测试记录](/Users/qiyongxi/lively/ai-video-creative-studio/TEST_RESULTS.md)
