# AI Video Creative Studio — PRD

## Product Overview / Value Proposition

帮助不熟悉视频 Prompt 的营销人员，把营销 Brief 转成可编辑计划、选定镜头版本，并得到可观看、可导出的 First Cut。集中维护共享视觉说明、生成尝试与版本记录。英文 UI，中文工程及产品文档。本地单人工作台，在线演示须有访问密码。

## Target Users / Problem Statements / Initial Hypotheses

目标用户：Marketing Specialist、Social Media Creator、小品牌主、代理商执行人员。假设他们需要帮助把营销目标转换成镜头描述，避免反复复制品牌说明，并关联修改与结果。这些是待验证假设；没有开展用户访谈，没有验证付费意愿、市场规模或效率收益。

## 轻量竞品分析

资料核实日期：2026-10-17。仅做官方功能资料分析，未执行付费产品横向实测。

| 产品          | 官方已有能力                                       | 本项目的取舍                                                               |
| ------------- | -------------------------------------------------- | -------------------------------------------------------------------------- |
| BACH          | 文本生视频、参考驱动、异步任务；当前文档已转向 Pro | 把生成作为可替换 Provider，先做营销规划流程，不竞争基础模型质量            |
| Runway        | 参考素材、复用参考、节点式 Workflows               | 为不需要构建节点流的营销用户提供固定且可编辑的路径；不是声称竞品没有工作流 |
| Adobe Firefly | 相机运动参考、镜头控制、视频编辑生态               | 首版聚焦 Brief、共享说明和任务评审，不做专业时间线                         |

来源：[BACH](https://www.bach.art/api/docs/bach_1_0_pro)、[Runway Workflows](https://help.runwayml.com/hc/en-us/articles/45763528999699-Introduction-to-Workflows)、[Firefly](https://helpx.adobe.com/nz/firefly/web/work-with-audio-and-video/work-with-video/match-camera-motion-to-reference-video.html)。

与直接使用生成工具的区别是工作流组织：营销输入 → 可编辑计划与共享 Creative Direction → Scene 版本选择 → 可审阅 First Cut。是否更容易完成任务仍需用户测试，不代表技术壁垒或已验证优势。

## JTBD / 当前用户旅程

当我有一个短视频营销 Brief，我希望得到可审阅的 First Cut，从整体判断创意，再仅重做较弱的镜头，而无需重新生成整个项目。这是产品任务假设，尚未开展外部用户验证。

Projects → Plan（Brief、Creative Direction、Storyboard）→ Generate & Select（Scene 版本与历史）→ Preview & Export（初剪与 MP4）。三个创作阶段围绕项目展开，Global Tasks 与 Analytics 仅作为次级工具保留。

## 本轮体验契约（2026-10-18）

### Plan：编辑内容与保存

- Brief 说明营销目标；Creative Direction 说明跨镜头共享的人物、产品、品牌、风格；Scene 描述一个镜头的具体表现。三者在同一 Plan 编辑，用一个 **Save Plan** 原子保存。
- 显示 All plan changes saved 或 Unsaved: Brief / Creative Direction / Scenes；冲突或校验失败保留本地草稿，不假装保存成功。未保存内容不能提交生成/重建。暂不自动保存，离开页面须留意未保存提示。
- 新项目所有文字输入为空。共享说明从 Brief 的产品、品牌、风格初始化；人物留空，不猜测包装或场景。Morning Brew 仅通过 Fill example brief 或预制 Example 显式进入。
- 默认直接编辑 Visual Description、Subject、Camera Movement、Lighting、Mood。确定性 Composer 将五项及可选 Scene Notes 与当前共享档案组合，不在编辑时请求 LLM。
- Advanced 展示真正会提交的 Final Prompt。显式 Prompt Override 替换镜头指令块，共享档案仍生效；开启时结构化字段禁用但保留，关闭后恢复。旧版手写 Prompt 保留为显式 Override，历史任务快照不改写。
- 冲突规则：共享身份、产品、品牌、风格优先于冲突的 Scene 文本；Scene 补充动作和镜头细节。界面说明规则，不自动删除或改写用户输入，也不声称能检测自然语言冲突或保证模型遵循。

### Generate & Select：下一次生成与已有结果

- 每个 Scene 保存 selectedGenerationTaskId；首次成功自动选中，后续成功不替换。选择仅接受该 Scene 的成功任务；重试保留原尝试。
- 新生成使用已保存 Plan 和当前档案，任务保存不可变的结构化字段、模式、档案版本与 Final Prompt。编辑不会改变历史任务、已选视频或现有 First Cut。
- 默认不显示原始 Prompt 编辑框、星级评分或技术参数。Notes & details 中可写私人的 Review Notes，只记录版本判断，不参与模型输入。
- 仅缺少选片时显示 Generate missing scenes。错误、进度、能力限制、未保存和付费提交提示始终保留。

### Preview & Export：项目结果

- 所有 Scene 有选片后，用本地 FFmpeg 按顺序合并单一 MP4。最新且可用的 First Cut 突出观看、Export MP4；JSON Export、Delete Project、Regenerate all scenes 位于 More。
- 仅实际合并输入变化才需更新：已选任务、播放顺序或输出画布。画布跟随第一个已选任务的原始画幅，避免修改未来生成用的 Brief 画幅就无故使旧视频过期。标题、Brief、Prompt、共享档案、规划秒数不改变已有视频文件。
- First Cut 保留不可变选片快照；新选择未构建时继续显示旧预览，并提示更新。文件缺失、构建失败、播放失败均显示真实错误，不伪装成功。
- 15 秒默认 3×5，30 秒默认 5×6。批量生成前预算需平衡；草稿可未平衡。初剪取实际片段时长，不自动裁切或补齐。
- 卡片与 Scene 优先用已有真实结果的本地首帧缩略图，无结果用中性占位。预制 Example 三条真实 Wan 3.0 视频及初剪均为稳定本地资源，打开不调用模型；Duplicate plan 不复制视频。

## 内部指标与后续验证

核心诊断为 Brief-to-Storyboard conversion、终态 Generation Success Rate、First Cut Built、MP4 Exported。不再把 Average User Rating 作为产品成功指标。失败率、重试率、耗时和处理中数量继续保留；零样本显示 —。

`first_cut_built` 按已完成输出 ID 去重；相同选片缓存命中不增加。`mp4_exported` 仅显式导出链接成功开始返回媒体时记录，以每次点击生成的 UUID 去重 Range 请求；HEAD、预览和 JSON 不计。它表示下载请求已获响应，不能证明用户完整下载或打开文件。`project_exported` 仍仅代表 JSON。计数按事件时间，尚未构成以项目为分母的完整 First Cut 转化率。

内部保留 mock/live/mixed 执行模式与 user/demo 来源分离，测试数据库独立；Example 不算用户增长。高级定义放在展开区，不制造样本或收益数字。

本轮是准备用户测试的工程验收，尚无真实外部用户研究。观察式测试应验证用户能否独立完成 Brief → 编辑/保存 → 选片 → 初剪 → 导出，并理解修改作用范围；参见 USER_TESTING.md。

## 非目标与限制

不做完整时间线、转场、字幕、配乐、配音、混音、自动创意剪辑、多人协作或参考图一致性技术。仅硬切拼接，原音可能不连续。视频缓存依赖本地磁盘，备份需要同时保留 SQLite 与媒体目录；首次缓存前服务商链接可能过期。旧 BACH v1、Docker 运行、Railway 部署及真实用户研究仍有各自验证边界。
