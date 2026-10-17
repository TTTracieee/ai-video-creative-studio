# 真实生成全流程：百炼 Qwen + 万相

## 先分清 Mock 与真实生成

Mock 视频是仓库自带的固定演示 MP4，不根据 Prompt 生成内容。它只验证任务状态、播放、重试和评分，不能证明生成效果。

本项目现在实现的真实链路为：Brief → Qwen 生成分镜 → 编辑 Scene / Visual Consistency Profile → 万相生成每个镜头 → 轮询实际任务 → 播放真实生成结果 → Review。它输出多个镜头片段，不自动拼接成广告成片。真实生成仍受模型效果、账号权限及余额影响。

## 一个国内平台账号

1. 在[阿里云百炼](https://www.aliyun.com/product/bailian)开通模型服务，完成平台要求的认证。国内站支持支付宝、银联和网银充值，无需美国银行卡。[充值说明](https://help.aliyun.com/zh/document_detail/324650.html)
2. 选择北京地域、默认业务空间，创建 API Key，确保其有 Qwen Flash 和万相模型调用权限。先检查实际可用的免费额度，再按需小额充值。不需要购买服务器。
3. 密钥只保存在本地 `.env`。同地域 Qwen 和万相使用同一个 `DASHSCOPE_API_KEY`，两者都直接请求阿里云，不需要 OpenAI 账号。[创建 Key](https://help.aliyun.com/zh/model-studio/get-api-key)

## 本地配置

在项目根目录 `.env` 设置以下变量，保留原有 `DATABASE_URL` 等配置。不要修改 `.env.example` 来保存密钥。

```dotenv
STORYBOARD_PROVIDER="qwen"
VIDEO_PROVIDER="wan2.2"
DASHSCOPE_API_KEY="替换为你自己的百炼APIKey"
DASHSCOPE_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
DASHSCOPE_MODEL="qwen-flash"
```

上述 URL 对应北京地域旧公共域名，官方说明仍可用；若使用专属业务空间域名或其他地域，请复制控制台与 Key 匹配的完整兼容接口 Base URL，例如 `https://WORKSPACE_ID.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`。视频 Adapter 自动使用同源的 `/api/v1` 接口，不要把视频任务路径填进 Base URL。[官方域名和协议说明](https://help.aliyun.com/en/model-studio/legacy-wan-text-to-video-api-reference)

停止已有开发服务后运行：

```bash
npm run dev
```

打开 `http://127.0.0.1:3000`。缺少 Key 时页面会明确列出需要配置的变量并禁用生成；Live 标签只表示选择了真实 Provider，不代表连接或真实生成已经成功。

## 第一次真实验收：15 秒规划，先生成一个镜头

1. 创建 Morning Brew 示例，选择 15 秒。点击 Generate storyboard：Qwen 应返回三个 5 秒镜头。
2. 查看 Scene Prompt、共享视觉说明和 Final submitted prompt preview。Qwen 会为共享说明预留字数；万相 2.2 的最终组合 Prompt 必须不超过 800 字符。若手动编辑超限，缩短 Scene Prompt、Consistency Notes 或共享档案后保存；应用不会截断内容。
3. 只点击第一个镜头的 Generate clip。它会创建真实万相任务，不返回仓库中的演示视频。
4. 在 Generate & review 查看 Pending → Processing → Completed。生成通常需要数分钟，页面约每 15 秒查询一次。可刷新恢复同一任务；不要重复点击提交来查询进度。
5. 播放返回的视频，填写评分与反馈并保存。确认这是新生成的内容，再逐个生成剩余两个镜头。

Generate all clips 每次会给全部镜头创建新尝试；若已经生成第一个镜头，再点击它会重新生成全部三个镜头并可能再次计费。首次验证后建议分别点击剩余镜头，避免重复花费。

万相结果 URL 和任务 ID 的查询有效期为 24 小时。用 Open clip 打开并自行保存视频；本版没有永久媒体存储。Review 和输入快照保留在 SQLite 中，视频链接过期不代表文件已被本地保存。

## 时长、成本与 30 秒规划

以下为 2026-10-17 核对的北京地域原价估算，不含重试，也不代表实测账单。[官方价格](https://help.aliyun.com/zh/model-studio/model-pricing)

| 配置                       | 实际模型 / 规格               | 限制                                     | 参考费用                                     |
| -------------------------- | ----------------------------- | ---------------------------------------- | -------------------------------------------- |
| `STORYBOARD_PROVIDER=qwen` | `qwen-flash`                  | 非思考 JSON Object + 服务端字段/时长校验 | 输入 2,000、输出 3,000 Token 约 0.0048 元/次 |
| `VIDEO_PROVIDER=wan2.2`    | `wan2.2-t2v-plus`，480P，无声 | 单镜头固定 5 秒，Prompt ≤800 字符        | 0.70 元/镜头；三个镜头共 2.10 元             |
| `VIDEO_PROVIDER=wan2.6`    | `wan2.6-t2v`，720P            | 单镜头 2–15 秒整数，Prompt ≤1,500 字符   | 0.60 元/秒；五个 6 秒镜头共 18 元            |

30 秒仍默认五个 6 秒镜头；万相 2.2 不支持 6 秒，应用会拒绝提交。可以明确编辑为六个 5 秒镜头（添加一个 Scene 并平衡总时长，约 4.20 元），或将 `.env` 中 `VIDEO_PROVIDER` 改为 `wan2.6` 并重启，保留五个 6 秒镜头。应用不会静默修改时长、切换模型或扩大费用。

## 错误与验证边界

- 鉴权/权限/余额问题：检查 Key、地域、业务空间和控制台模型权限。应用不展示原始服务商错误或密钥。
- Qwen 输出不符合 JSON、字段或时长要求时最多额外修复一次；截断、限流和超时不会自动重试。共享档案本身过长会在请求前提示缩短。
- 万相提交结果不明时不自动重发。先在百炼控制台确认，手动重试须接受可能重复计费；新尝试保留旧记录和输入快照。
- 已完成模拟协议、持久化链路和浏览器测试，不等于已经完成真实付费验收。只有用实际账号生成并播放新视频后才能记录为真实接通；当前结果见 TEST_RESULTS.md。
