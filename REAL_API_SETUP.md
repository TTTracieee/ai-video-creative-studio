> P0 更新（2026-10-18）：正常创作流程已改为 Plan → Generate & Select → Preview & Export。旧说明中的 Generate clip 对应 Generate scene；Review 已收进 Notes & details。全部 Scene 选片后可本地 Build first cut / Export MP4，合并不调用模型；FFmpeg/ffprobe 为合并依赖。预制 Example 已保存三个真实片段和初剪，打开不计费。以下价格和接口核对日期仍是原记录日期，实际费用以控制台为准。

# 真实生成全流程：百炼 Qwen + 万相

## 先分清 Mock 与真实生成

Mock 视频是仓库自带的固定演示 MP4，不根据 Prompt 生成内容。它只验证任务状态、播放、重试和评分，不能证明生成效果。

本项目现在实现的真实链路为：Brief → Qwen 生成分镜 → 编辑 Scene / Visual Consistency Profile → 万相生成每个镜头 → 轮询实际任务 → 播放真实生成结果 → Review。它输出多个镜头片段，在选片后可本地合并 First Cut成广告成片。真实生成仍受模型效果、账号权限及余额影响。

## 一个国内平台账号

1. 在[阿里云百炼](https://www.aliyun.com/product/bailian)开通模型服务，完成平台要求的认证。国内站支持支付宝、银联和网银充值，无需美国银行卡。[充值说明](https://help.aliyun.com/zh/document_detail/324650.html)
2. 选择北京地域、对应业务空间，创建通用 API Key，确保其有 Qwen 3.8 Flash 和万相 3.0 的调用权限。先在免费额度页分别查 `qwen3.8-flash` 和 `wan3.0-video` 的剩余量与到期时间；两者不共用额度，不需要购买服务器或月包。账号无欠费且仍有可用免费额度时，可先不充值。建议在控制台开启“免费额度用完即停”。[免费额度规则](https://help.aliyun.com/zh/model-studio/new-free-quota)
3. 密钥只保存在本地 `.env`。同地域 Qwen 和万相使用同一个 `DASHSCOPE_API_KEY`，两者都直接请求阿里云，不需要 OpenAI 账号。[创建 Key](https://help.aliyun.com/zh/model-studio/get-api-key)

## 本地配置

在项目根目录 `.env` 设置以下变量，保留原有 `DATABASE_URL` 等配置。不要修改 `.env.example` 来保存密钥。

```dotenv
STORYBOARD_PROVIDER="qwen"
VIDEO_PROVIDER="wan3.0"
DASHSCOPE_API_KEY="替换为你自己的百炼APIKey"
DASHSCOPE_BASE_URL="https://YOUR_WORKSPACE_ID.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
DASHSCOPE_MODEL="qwen3.8-flash"
```

`YOUR_WORKSPACE_ID` 必须替换为真实业务空间 ID，不能原样使用。直接打开[业务空间管理（北京）](https://bailian.console.aliyun.com/cn-beijing/settings/workspace)，复制当前空间的 API Host，再加上 `https://` 与 `/compatible-mode/v1`。API Host 是接入地址，不是 API Key；免费额度列表本身不是配置入口。Wan 3.0 按本次核实的官方专属域名接入，不沿用旧公共域名。视频 Adapter 自动使用同源的 `/api/v1` 接口，不要把视频任务路径填进 Base URL。模型、Key 和域名必须在同一地域。[官方域名说明](https://help.aliyun.com/zh/model-studio/regions)、[万相 3.0 API](https://help.aliyun.com/zh/model-studio/wan3-video-generation-api-reference)

停止已有开发服务后运行：

```bash
npm run dev
```

打开 `http://127.0.0.1:3000`。缺少 Key 时页面会明确列出需要配置的变量并禁用生成；Live 标签只表示选择了真实 Provider，不代表连接或真实生成已经成功。

## 第一次真实验收：15 秒规划，先生成一个镜头

1. 创建 Morning Brew 示例，选择 15 秒。点击 Generate storyboard：Qwen 应返回三个 5 秒镜头。
2. 查看 Scene Prompt、共享视觉说明和 Final submitted prompt preview。Qwen 会为共享说明预留字数；万相 3.0 的最终组合 Prompt 不得超过 20,000 字符。若手动编辑超限，缩短 Scene Prompt、Consistency Notes 或共享档案后保存；应用在请求前拒绝超限内容，不交给模型静默截断。
3. 只点击第一个镜头的 Generate clip。它会创建真实万相任务，不返回仓库中的演示视频。
4. 在 Generate & review 查看 Pending → Processing → Completed。生成通常需要数分钟，页面约每 15 秒查询一次。可刷新恢复同一任务；不要重复点击提交来查询进度。
5. 播放返回的视频，填写评分与反馈并保存。确认这是新生成的内容，再逐个生成剩余两个镜头。

Generate all clips 每次会给全部镜头创建新尝试；若已经生成第一个镜头，再点击它会重新生成全部三个镜头并可能再次计费。首次验证后建议分别点击剩余镜头，避免重复花费。官方列出的万相 3.0 北京新人额度为 30 秒；若后台显示剩余 30/共 30，纯文生视频可先验证六个 5 秒镜头（重生成也消耗额度）。实际余量和有效期以账号控制台为准，代码不查询或承诺账户额度。

万相结果 URL 和任务 ID 的查询有效期为 24 小时。用 Open clip 打开并自行保存视频；本版没有永久媒体存储。Review 和输入快照保留在 SQLite 中，视频链接过期不代表文件已被本地保存。

## 时长、成本与 30 秒规划

以下为 2026-10-17 核对的北京地域原价估算，不含重试，也不代表实测账单。[官方价格](https://help.aliyun.com/zh/model-studio/model-pricing)

| 配置                                                        | 实际模型 / 规格               | 限制                                     | 参考费用                                                                                           |
| ----------------------------------------------------------- | ----------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `STORYBOARD_PROVIDER=qwen`、`DASHSCOPE_MODEL=qwen3.8-flash` | `qwen3.8-flash`               | 非思考 JSON Object + Zod/业务校验        | 输入 2,000、输出 3,000 Token 约 0.0097 元/次；北京新人额度 100 万 Token                            |
| `VIDEO_PROVIDER=wan3.0`                                     | `wan3.0-video`，480P，带声音  | 单镜头 2–30 秒整数，Prompt ≤20,000 字符  | 原价 0.30 元/秒；一个 5 秒镜头 1.50 元，三个镜头 4.50 元；北京新人额度 30 秒，活动折扣以控制台为准 |
| `STORYBOARD_PROVIDER=qwen`、`DASHSCOPE_MODEL=qwen-flash`    | `qwen-flash`                  | 非思考 JSON Object + 服务端字段/时长校验 | 输入 2,000、输出 3,000 Token 约 0.0048 元/次                                                       |
| `VIDEO_PROVIDER=wan2.2`                                     | `wan2.2-t2v-plus`，480P，无声 | 单镜头固定 5 秒，Prompt ≤800 字符        | 0.70 元/镜头；三个镜头共 2.10 元                                                                   |
| `VIDEO_PROVIDER=wan2.6`                                     | `wan2.6-t2v`，720P            | 单镜头 2–15 秒整数，Prompt ≤1,500 字符   | 0.60 元/秒；五个 6 秒镜头共 18 元                                                                  |

Wan 3.0 可保留 15 秒三个 5 秒镜头、30 秒五个 6 秒镜头，逐镜头生成，在选片后可本地合并 First Cut。旧 Wan 2.2/2.6 接入仍保留，但免费额度相互独立：万相 3.0 的额度不能支付 2.2 的请求。若显式使用 2.2，30 秒默认五个 6 秒镜头会被拒绝，需编辑为六个 5 秒镜头或选择支持 6 秒的 Provider。应用不会静默修改时长、切换模型或扩大费用。

## 错误与验证边界

- 鉴权/权限/余额问题：检查 Key、地域、业务空间和控制台模型权限。应用不展示原始服务商错误或密钥。
- Qwen 输出不符合 JSON、字段或时长要求时最多额外修复一次；截断、限流和超时不会自动重试。共享档案本身过长会在请求前提示缩短。
- 万相提交结果不明时不自动重发。先在百炼控制台确认，手动重试须接受可能重复计费；新尝试保留旧记录和输入快照。
- 已完成模拟协议、持久化链路和浏览器测试，不等于已经完成真实付费验收。只有用实际账号生成并播放新视频后才能记录为真实接通；当前结果见 TEST_RESULTS.md。
