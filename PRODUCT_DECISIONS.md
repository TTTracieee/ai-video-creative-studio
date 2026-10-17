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

2026-10-17 用户提出没有美国银行卡、希望降低成本。增加阿里云百炼 Qwen 分镜 Adapter，默认 `qwen-flash`；阿里云国内站支持支付宝、银联等充值方式。视频继续独立使用 Mock，避免每次验证产品流程都支付视频费用。此选择由当前支付约束和公开价格支持，不代表已证明 Qwen 的分镜质量与任何模型相同或更好。[充值说明](https://help.aliyun.com/zh/document_detail/324650.html)、[模型价格](https://help.aliyun.com/zh/model-studio/model-pricing)

采用非思考 JSON Object + 服务端 Zod/时长验证，不把 JSON 格式能力描述成严格 Schema 保证。输出校验失败最多增加一次修复请求，其他外部错误不自动重试。价格测算明确标记为估算，未执行真实付费验证；不替用户注册、充值或购买套餐。真实视频的低成本候选万相仅记录在 README，暂不扩大实现范围。[结构化输出](https://help.aliyun.com/en/model-studio/qwen-structured-output)

## 延后事项与迭代

延后参考素材上传、视频拼接、多人协作、更多模型和复杂分析报表。下一步先执行用户测试，观察 Brief 理解、分镜编辑和共享说明的可发现性；收集一致性主观评分，才决定是否增加图像参考或其他 Provider。没有预设效率提升数值。
