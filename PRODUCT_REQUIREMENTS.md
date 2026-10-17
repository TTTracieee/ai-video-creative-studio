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

与直接使用生成工具的区别是工作流组织：营销输入 → 分镜规划 → 共享 Visual Consistency Profile → 镜头编辑 → 多次尝试与反馈。是否更容易完成任务仍需用户测试，不代表技术壁垒或已验证优势。

## User Stories / Journey

作为营销人员，我希望为 Morning Brew 创建 15 秒 Instagram 广告计划，获得三个可编辑镜头，统一人物、包装、品牌和风格，生成每个镜头，失败后重试，并给结果评分。用户可导出分镜及项目记录。

## Goals / MVP Prioritization

- P0：Brief、分镜、Visual Consistency Profile、编辑、Mock 生成、Review、持久化、校验和关键自动化测试。
- P1：真实 LLM、BACH v1 Adapter、基本 Analytics、导出和作品集说明。核心测试通过后开始。
- P2：私密在线演示、Railway 验证；任何公开地址启用前必须完成访问保护。

15 秒默认 3×5 秒，30 秒默认 5×6 秒。总时长只表示规划；支持保存时长未平衡的草稿，批量生成前必须平衡。单镜头遵循当前 Provider.capabilities。Visual Consistency Profile 是可编辑的 Prompt 约束，不能保证模型一致性。

## Success Metrics

指标不是目标达成证据。首版突出 Brief-to-Storyboard conversion、终态 Generation Success Rate、Average User Rating；另外保留失败率、重试率、完成耗时。Mock/Live、user/demo/test 分开，测试数据不出现在普通界面。计算定义见架构文档和 Analytics 页面。

## Non-goals / Risks and Limitations

不做视频拼接、配音、素材上传、多人协作或 World Model 训练。无 Key 时分镜是模板 Mock，视频是明确标注的固定演示素材。模板不是 AI 推理。BACH 历史 v1 文档已跳转，旧接口实际可用性需凭证验证；不自动切换到 Pro。结果 URL 可能过期，数据库保留记录不等于永久托管视频。
