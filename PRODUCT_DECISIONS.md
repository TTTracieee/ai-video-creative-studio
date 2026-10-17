# 产品决策记录

## 目标用户与价值假设

选择营销执行人员是为了让作品集围绕一个可演示任务形成闭环，而不是同时服务所有专业影视流程。尚无访谈证据支持这些用户一定愿意使用本产品。假设固定流程、可编辑分镜和共享品牌说明能够降低规划负担，后续用任务成功率和定性反馈验证。

## 竞品与差异化

2026-10-17 依据官方文档做轻量研究：[BACH](https://www.bach.art/api/docs/bach_1_0_pro)、[Runway](https://help.runwayml.com/hc/en-us/articles/45763528999699-Introduction-to-Workflows)、[Firefly](https://helpx.adobe.com/nz/firefly/web/work-with-audio-and-video/work-with-video/match-camera-motion-to-reference-video.html)。竞品已有参考、一致性和工作流能力。本项目的定位是营销 Brief 到分镜、共享说明、生成尝试和 Review 的组织方式；不声称生成质量优于竞品。

## 优先级与体验取舍

先验证无 Key 的核心路径，随后再做真实 API、Analytics 和在线演示。Mock 有显眼标识，不把演示素材或个人测试称作真实模型输出或用户增长。Visual Consistency Profile 优先于复杂时间线；它是四个共享文本字段，生成时自动引用，但不是跨镜头身份锁定技术。

15/30 秒只代表分镜规划，默认 3/5 个镜头。首版不自动合成成片。添加删除镜头时允许保存未平衡草稿；生成全部镜头前要求总时长一致。镜头时长根据 Provider 能力检查。

## 技术方案

Next.js 单体减少部署环节；SQLite + Prisma 支持真实持久化和迁移；Zod 对外部输入做运行时校验。Mock 任务由数据库时间计算，不依赖页面内倒计时或会丢失的后台计时器。任务保留输入快照，编辑不会改写历史结果。真实提交不自动重放，以免重复计费。

## BACH 文档决策

2026-10-17 当前 [Authentication](https://www.bach.art/api/docs/authentication) 明确记载 AK/SK、HS256 JWT 和 Bearer；旧版 `/docs/videos-bach/v1/text2video` 已跳转到 Pro 页面。指定旧版协议与当前 `/video/v2` 分开，旧版状态明确标记为未验证。无凭证不做实际付费调用，不宣称 Live 已通过。

## 支付方式与成本取舍

2026-10-17 为满足人民币支付、成本和完整真实生成的约束，采用阿里云百炼 Qwen 分镜 + 万相镜头生成；默认 `qwen-flash` + `wan2.2-t2v-plus` / 480P。阿里云国内站支持支付宝、银联等充值方式。Mock 保留用于没有账号时的明确演示，不能作为真实生成验收。此选择由支付约束和公开价格支持，不代表已证明任何模型的生成质量。[充值说明](https://help.aliyun.com/zh/document_detail/324650.html)、[模型价格](https://help.aliyun.com/zh/model-studio/model-pricing)

采用非思考 JSON Object + 服务端 Zod/时长验证，不把 JSON 格式能力描述成严格 Schema 保证。Qwen 为共享档案预留字数，输出校验失败最多修复一次。万相 2.2 固定 5 秒和 800 字符，30 秒默认五镜头不静默修改：可显式编辑为六个 5 秒镜头，或选择支持 6 秒且更贵的万相 2.6。任务结果不明时不自动重发，缺少 Key 时禁用生成。价格是估算；真实账号实际生成并播放成功之前不记录为真实付费接通，不替用户注册或充值。[结构化输出](https://help.aliyun.com/en/model-studio/qwen-structured-output)、[万相接口](https://help.aliyun.com/en/model-studio/legacy-wan-text-to-video-api-reference)

## 项目删除的归属边界

项目是 Brief、共享视觉档案、分镜、任务尝试和评审的容器，任务没有独立于项目的业务归属，因此删除整个项目时级联清理全部本地关联记录；单独删镜头仍保留任务历史。不新增回收站或独立素材库，确认框明确永久删除及导出选项。保留其他项目不受影响，Analytics 随数据删除重新计算。

Pending/Processing 任务必须先结束并同步状态，避免在生成中丢失追踪记录；确认框提供 Check task status。删除本地记录不等于取消服务商生成，不退还已发生费用，也不操作用户下载的文件。后端同时验证项目版本和活动任务，前端确认不代替服务端检查。

## 延后事项与迭代

延后参考素材上传、视频拼接、多人协作、更多模型和复杂分析报表。下一步先执行用户测试，观察 Brief 理解、分镜编辑和共享说明的可发现性；收集一致性主观评分，才决定是否增加图像参考或其他 Provider。没有预设效率提升数值。
