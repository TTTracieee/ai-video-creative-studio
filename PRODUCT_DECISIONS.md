# 产品决策记录

## 目标用户与价值假设

选择营销执行人员是为了让作品集围绕一个可演示任务形成闭环，而不是同时服务所有专业影视流程。尚无访谈证据支持这些用户一定愿意使用本产品。假设固定流程、可编辑分镜和共享品牌说明能够降低规划负担，后续用任务成功率和定性反馈验证。

## 竞品与差异化

2026-10-17 依据官方文档做轻量研究：[BACH](https://www.bach.art/api/docs/bach_1_0_pro)、[Runway](https://help.runwayml.com/hc/en-us/articles/45763528999699-Introduction-to-Workflows)、[Firefly](https://helpx.adobe.com/nz/firefly/web/work-with-audio-and-video/work-with-video/match-camera-motion-to-reference-video.html)。竞品已有参考、一致性和工作流能力。本项目的定位是营销 Brief 到计划、共享说明、选片和 First Cut 的组织方式；不声称生成质量优于竞品。

## 优先级与体验取舍

最初先验证无 Key 的核心路径，随后接入真实 API 和内部 Analytics。初版 Mock 有显眼标识，不把演示素材或个人测试称作真实模型输出或用户增长。Visual Consistency Profile 优先于复杂时间线；它是四个共享文本字段，生成时自动引用，但不是跨镜头身份锁定技术。

15/30 秒只代表分镜规划，默认 3/5 个镜头。初版只输出独立片段；该边界已由下述 P0 决策更新为 First Cut。添加删除镜头时允许保存未平衡草稿；生成全部镜头前要求总时长一致。镜头时长根据 Provider 能力检查。

## 技术方案

Next.js 单体减少部署环节；SQLite + Prisma 支持真实持久化和迁移；Zod 对外部输入做运行时校验。Mock 任务由数据库时间计算，不依赖页面内倒计时或会丢失的后台计时器。任务保留输入快照，编辑不会改写历史结果。真实提交不自动重放，以免重复计费。

## BACH 文档决策

2026-10-17 当前 [Authentication](https://www.bach.art/api/docs/authentication) 明确记载 AK/SK、HS256 JWT 和 Bearer；旧版 `/docs/videos-bach/v1/text2video` 已跳转到 Pro 页面。指定旧版协议与当前 `/video/v2` 分开，旧版状态明确标记为未验证。无凭证不做实际付费调用，不宣称 Live 已通过。

## 支付方式与成本取舍

2026-10-17 为满足人民币支付、成本和完整真实生成的约束，采用阿里云百炼 Qwen 分镜 + 万相镜头生成；早期配置为 `qwen-flash` + `wan2.2-t2v-plus` / 480P。阿里云国内站支持支付宝、银联等充值方式。Mock 保留用于没有账号时的明确演示，不能作为真实生成验收。此选择由支付约束和公开价格支持，不代表已证明任何模型的生成质量。[充值说明](https://help.aliyun.com/zh/document_detail/324650.html)、[模型价格](https://help.aliyun.com/zh/model-studio/model-pricing)

采用非思考 JSON Object + 服务端 Zod/时长验证，不把 JSON 格式能力描述成严格 Schema 保证。Qwen 为共享档案预留字数，输出校验失败最多修复一次。万相 2.2 固定 5 秒和 800 字符，30 秒默认五镜头不静默修改：可显式编辑为六个 5 秒镜头，或选择支持 6 秒且更贵的万相 2.6。任务结果不明时不自动重发，缺少 Key 时禁用生成。价格是估算；真实账号实际生成并播放成功之前不记录为真实付费接通，不替用户注册或充值。[结构化输出](https://help.aliyun.com/en/model-studio/qwen-structured-output)、[万相接口](https://help.aliyun.com/en/model-studio/legacy-wan-text-to-video-api-reference)

同日根据实际账号可见免费额度，将当前接入示例调整为 `qwen3.8-flash` + `wan3.0-video` / 480P，优先使用已确认可用的额度减少首次验收费用。万相 3.0 使用新 `resolution`/`ratio` 参数和业务空间专属域名，支持原来的 5/6 秒镜头，仍按 Scene 分别提交。免费额度按型号独立，Wan 3.0 的额度不能抵扣旧版调用；30 秒只够有限次数验证，首次仅提交一个 5 秒镜头。将原价、活动价、账号剩余额度与真实验收分开记录，不把新人额度描述成永久免费。[价格与额度](https://help.aliyun.com/zh/model-studio/model-pricing)、[接入域名](https://help.aliyun.com/zh/model-studio/regions)

## 项目删除的归属边界

项目是 Brief、共享视觉档案、分镜、任务尝试和评审的容器，任务没有独立于项目的业务归属，因此删除整个项目时级联清理全部本地关联记录；单独删镜头仍保留任务历史。不新增回收站或独立素材库，确认框明确永久删除及导出选项。保留其他项目不受影响，Analytics 随数据删除重新计算。

Pending/Processing 任务必须先结束并同步状态，避免在生成中丢失追踪记录；确认框提供 Check task status。删除本地记录不等于取消服务商生成，不退还已发生费用，也不操作用户下载的文件。后端同时验证项目版本和活动任务，前端确认不代替服务端检查。

## 延后事项与迭代

继续延后参考素材上传、多人协作、更多模型和复杂报表；简单拼接已纳入 P0，专业编辑继续延后。下一步先执行用户测试，观察 Brief 理解、分镜编辑和共享说明的可发现性；收集对一致性和流程的定性判断，才决定是否增加图像参考或其他 Provider。没有预设效率提升数值。

## P0：从多个片段到 First Cut（2026-10-18）

开发者亲自使用时指出两处认知断点：Storyboard 与 Visual Consistency 看似重复；同一项目最终分散为多个 task/clip，缺少整体结果。这是一次内部使用反馈，不是用户访谈或需求验证。

将三个规划内容合并为 Plan，Visual Consistency Profile 在 UI 改为 Creative Direction。保留四个字段和版本，不重做底层 Provider 或改写历史 Prompt。说明只指导未来生成，不能保证人物、产品与品牌实际一致。

新增“选用结果”概念：首次成功自动选中以减少操作；新成功结果不抢占既有选择。Scene 是生成页面中心，历史下沉；本轮进一步将评分移出主流程。项目状态由选片和输出推导，避免多个状态字段互相矛盾。

本地 FFmpeg 对已选片段统一编码、画幅与音频流后顺序拼接；不调用模型。保存选片/顺序/画幅/时长快照；缓存签名在下述体验迭代中收敛为实际合并参数。源片段不足、过期、FFmpeg 缺失及合并失败时保留选片并给可重试错误。输出称 First Cut，原音硬切，不承诺无缝衔接或最终广告质量。[FFmpeg concat 文档](https://www.ffmpeg.org/ffmpeg-formats.html#concat)

Example 与执行模式分开：固定清单保存已完成的真实 Qwen/Wan 结果与本地媒体，显式初始化命令幂等导入，不调用模型；普通重启不会恢复用户已删除的 Example。用户额外批准最多两个 5 秒片段、原价合计 ¥3 上限；实际仅提交这两个并均成功，复用此前一个片段。未查账单，不能把估算当实际扣费。复制入口明确为 Duplicate plan，避免复制片段后被误认为已为修改后的 Brief 生成。

普通页面移除反复的 Mock/Live 和 User-created 标签；仅保留 Example 和测试素材必要来源说明。Tasks/Analytics 放在 Workspace tools，不删除内部维度或夸大指标。P0 完成后停止增加 AI 功能，下一步应做任务观察和反馈验证。

## 体验修复：统一编辑、保存与完成态（2026-10-18）

**问题证据来源：** 项目维护者再次 review 并明确提出的产品问题，以及可复现代码行为；不是外部访谈。旧实现允许修改五个结构化字段但生成仍读取原始 Prompt；新项目共享档案带咖啡模板；保存入口分散；输出哈希混入不影响视频的标题和规划元数据。

**结构化编辑优先。** Composer 直接映射五个字段和 Scene Notes，编辑不调用 LLM。原始 Provider `prompt` 保留兼容契约；新规划使用 `promptMode=structured`。旧计划缺模式时转换为显式 Override，避免手写内容被静默替换；仅未修改的固定 Example 升级结构化默认入口。任务快照逐条保持原值。

**Override 是有意切换。** 它替换 Scene 块，不移除共享档案；开启时禁止同时编辑结构化字段，关闭时原字段恢复。全局身份/产品/品牌/风格优先，Scene 定义动作和镜头；UI 不自动重写冲突文本。没有自然语言冲突检测，模型是否遵循需通过结果判断。

**一个 Save Plan。** 同一事务保存 Brief、名称、共享档案、Scene 和排序，检查 revision；档案实际改变才递增 profileVersion。未保存区域显式列出，保存失败保留草稿。Brief 与共享风格有重叠时不自动联动，用户可明确分别修改，避免悄悄覆盖。现有视频保留，只影响后续生成。

**通用默认值。** 新项目文字为空，档案从 Brief 复制已给出的商品/品牌/风格，人物留空。Mock 分镜用通用品类表达，不推测衣服、包装、咖啡杯或晨光；Morning Brew 保留为用户明确打开的 Example。

**First Cut 依赖真实渲染输入。** 签名只含 renderer版本、实际画布及有序已选任务 ID。画布来自第一个所选任务的原始 ratio；编辑 Brief 的未来 ratio 不会修改旧视频。仍存完整历史快照，但标题、计划时长等仅供追踪，不参与缓存键。历史输出读取时计算同样签名，无需篡改其快照。选片/排序确实变化才要求 Update first cut。当前可播放输出优先 Export MP4，更多操作收进 More。

**少讲实现，多保留决策信息。** 真实视频提取本地 JPEG 首帧，尚无视频使用中性占位；缩略图不可用不伪造视觉结果。时长、错误、付费提交和未保存状态常驻，其余技术限制折叠。没有增加字幕、转场、音乐或完整时间线。

**Review Notes 与内部事件。** 移除星级控件，备注仅为用户自己的版本记录。数据库允许空 rating，保留已有评分以兼容历史，但不再用它作为核心 KPI。新增 first_cut_built 与 mp4_exported 本地事件，按输出/导出点击去重，继续区分执行模式和来源。导出事件仅证明媒体响应开始，不能声称文件已完整落盘；Example 行为不可当真实用户转化。

**验证边界。** 本轮全部生成验收使用隔离 Mock 与协议模拟，真实 Example 复用旧媒体，未申请或调用付费视频 API。真实模型对新 Composer 的输出质量、外部用户可用性、Docker/Railway 上线仍待单独验证。
