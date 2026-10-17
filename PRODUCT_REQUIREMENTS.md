# AI Video Creative Studio — PRD

## Product Overview / Value Proposition

帮助不熟悉视频 Prompt 的营销人员，把营销 Brief 转成可编辑的分镜计划，集中维护视觉一致性说明、Prompt、生成尝试和评审反馈。英文 UI，中文工程及产品文档。本地单人工作台，在线演示须有访问密码。

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

## P0 验收范围（2026-10-18）

- Plan 保留所有 Brief 与分镜编辑能力。Creative Direction 包含人物、产品、品牌、风格四项，共享注入未来生成的 Prompt，不承诺一致性。
- 每个 Scene 保存 selectedGenerationTaskId；首次完成自动选中，后续完成不替换。选择必须来自该 Scene 的成功任务；重试保留原尝试。
- 首页显示选中数和推导进度：Planning、Ready to generate、Generating / In progress、Ready to assemble、Assembling、Draft ready。
- 所有 Scene 有选片后，按当前顺序用本地 FFmpeg 合并单一 MP4；保存不可变选片快照。选择、顺序、标题、规划时长或画幅变化会使当前输出失效，需要重建。
- 15 秒默认 3×5，30 秒默认 5×6。批量生成前预算需平衡；编辑草稿可未平衡。初剪用实际片段时长，界面同时展示目标与实际值，不自动裁切或补齐。
- 预制 Example 使用三条真实 Wan 3.0 视频及已合并初剪，打开不发生成请求；Duplicate plan 仅复制规划，不复制视频。
- 普通创作页面不反复展示 Mock/Live 技术标签；测试素材仍保留简短真实来源，模型执行模式与内容来源继续在内部数据中分开。
- 数据持久化、Zod、服务端错误、版本冲突、自动化测试及访问保护继续保留。

## 指标与后续验证

已有终态生成成功率、Brief-to-Storyboard conversion、平均最新评分等保留在 Internal Analytics；Mock/Live 和 user/demo 分开，不将 Example 视为用户增长。新的选片到导出漏斗暂未新增埋点；后续 P1 再评估，不能从现有 JSON 导出事件推断 MP4 下载次数。

## 非目标与限制

不做完整时间线、转场、字幕、配乐、配音、混音、自动创意剪辑、多人协作或参考图一致性技术。仅硬切拼接，原音可能不连续。视频缓存依赖本地磁盘，备份需要同时保留 SQLite 与媒体目录；首次缓存前服务商链接可能过期。旧 BACH v1、Docker 运行、Railway 部署及真实用户研究仍有各自验证边界。
