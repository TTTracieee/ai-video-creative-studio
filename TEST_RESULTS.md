# 实际测试结果

最新验证：**2026-10-18，Brief-to-First-Cut 体验优化**。macOS、Node.js 22.20.0、Next.js 16.4.2、Prisma 6.19.0、Vitest 5.0.5、Playwright + 本机 Google Chrome。

## 本轮实际执行

| 命令 / 检查                                  | 结果                      | 范围                                                                        |
| -------------------------------------------- | ------------------------- | --------------------------------------------------------------------------- |
| `npm run db:generate` / `npm run db:migrate` | 通过                      | Review.rating 可空；只升级未修改的固定 Example Scene 编辑模式，保留历史快照 |
| `npm run typecheck`                          | 通过                      | Next 类型生成与严格 TypeScript                                              |
| `npm test`                                   | **9 文件、77 项通过**     | 原70项 + 新增7组体验集成测试，最终执行约20.6秒                              |
| `npm run lint`                               | **0 errors / 0 warnings** | 源码、脚本和测试                                                            |
| `npm run build`                              | 通过                      | Webpack生产构建、类型检查及standalone输出                                   |
| `npm run test:e2e`                           | **9 场景通过**            | 双Mock、隔离e2e数据库，最终执行约1.1分钟                                    |
| `npm run test:production`                    | 通过                      | 临时数据库、随机内存密码，生产权限/重启/媒体/事件去重                       |
| SQLite integrity / foreign keys              | `ok` / 0错误              | 迁移试验副本和日常库                                                        |
| 迁移前后历史任务快照逐条比较                 | 全部3条完全相同           | 没有重写历史输入；日常库当前1个Example项目                                  |

本轮**没有调用真实 LLM 或付费视频 API**，没有新增依赖、生成新付费片段或声称已开展用户研究。协议测试通过模拟 fetch；Example复用既有真实媒体。Docker镜像运行、Railway上线未执行，也未将历史依赖审计冒充本轮结果。

最终恢复3000端口后，另用Chrome只读检查日常Example：实际播放15.02秒，三个Scene均使用结构化编辑，真实首帧加载成功，390px无横向溢出，页面运行错误0、分镜/视频/合并提交0。

迁移前先将日常库备份到工作区外临时目录，在副本执行迁移和完整性/快照比较，再应用到日常库；数据库与缓存均不提交Git。

## 新增7组业务体验测试

`tests/experience.test.ts` 使用独立临时SQLite与媒体目录，实际执行FFmpeg：

1. 分别修改 Visual Description、Subject、Camera Movement、Lighting、Mood，验证每次最终Prompt和真实待提交任务快照包含对应新值；旧快照不变，fetch调用为0。
2. Override显式生效、共享说明保留、关闭后恢复结构化字段；空Override拒绝；旧手写Prompt安全保留。
3. 运动鞋项目默认值与Mock分镜没有无关咖啡、晨光、包装、人物服装设定；空Brief通用档案没有咖啡模板；2000字符有效商品描述创建后可正常读取。
4. 一次事务保存Brief/名称/Direction/Scenes；明确dirty区域；409或校验失败不部分写入；不自动联动覆盖用户输入。
5. 改标题、Brief画幅/风格/目标、Scene描述/计划时长、共享档案仍复用已有初剪；历史哈希兼容；换选片或顺序正确过期。
6. First Cut完成事件去重、缓存复用不重复计数；MP4导出UUID去重；JSON/模式/来源隔离；真实执行合并。
7. 无星级私人备注持久化，FFmpeg提取有效JPEG首帧与HEAD媒体响应。

原测试继续覆盖解析、时长预算、能力边界、数据库重连、任务状态、失败重试、幂等性、付费结果不明不重发、选片归属与历史保留、删除级联、媒体边界和访问保护。OpenAI、Qwen、Wan、BACH协议模拟不代表其所有线上模型均验证。

## 9条浏览器回归

1. Monica扩展属性注入后无水合警告，表单可操作。
2. 新建空表单、跑鞋项目、结构化编辑、三个区域统一保存、刷新恢复、下一次提交快照匹配。
3. 显式Override、结构化控件禁用、保存恢复、关闭后原字段恢复。
4. 模拟409保存失败，草稿与Unsaved: Scenes提示保留。
5. Morning Brew Brief → Storyboard → 全镜头Mock → 选片 → 无星级备注 → 本地FFmpeg合并/播放 → 顶部Export MP4 → Range与导出去重 → 改文字仍可导出 → 换片提示更新初剪。
6. 失败 → 重试成功 → 失败尝试保留在历史 → 私人备注。
7. More中的删除、活动任务阻止、永久删除后关联记录清理。
8. 真实预制Example首帧缩略图、约15秒初剪即播、顶部导出可见；无分镜/视频/合并提交；390px无横向溢出。
9. 内部新事件KPI、来源/执行模式隔离、无评分KPI、跨域写拒绝、手机首页。

首轮E2E有1处定位错误：必填字段的可访问名称含“\*”，测试少写符号。修正后9条全通过。业务测试曾发现Qwen预算按字段分割过严，改为最终组合Prompt总长度校验；没有放宽业务断言来隐藏问题。桌面Plan、完成态与手机布局截图已查看，保存于docs/images。

## 生产模式检查

临时数据库和仅在进程内保存的随机密码；未登录页面跳转/API401、预制媒体及JPEG保护、正确登录、Secure/HttpOnly/SameSite Cookie、配置无密钥、跨域写403、退出清Cookie。Mock任务生成中重启仍可恢复；所有选片本地合并后，JPEG文件头正确，MP4 Range/HEAD/下载有效；再次重启选片与输出仍可恢复。同一输出缓存命中只有1次构建事件，同一导出UUID的多次Range只有1次MP4事件。无真实付费调用。

## 之前的真实 API 与 Example（历史验收）

2026-10-17 已在一个演示来源 Morning Brew 项目真实执行 Qwen 3.8 Flash 分镜、共享说明/Scene编辑、一个5秒 Wan3.0 / 480P片段生成、Chrome播放、技术评审与JSON导出。初始分镜结构校验失败促成更具体的字段级修复反馈；最多一次修复的边界仍保留。

随后用户明确批准最多再生成两个5秒镜头，原价估算合计上限¥3。实际仅额外提交这两个 Wan3.0任务，均完成，未继续请求其他镜头。此前复用原片段，将三条真实视频缓存为本地资源；实际执行FFmpeg合并为15.0秒。原演示项目也已构建First Cut，原有任务/Review保留。上轮最终恢复3000端口服务后，Chrome实际打开原项目并播放，播放器时长约15.02秒、3/3选片、Draft ready、页面运行错误为0。

`public/examples/morning-brew/project.json` 保存示例规划、真实执行模式、任务输入快照和选片清单，不包含Key或临时远端结果地址。其三条视频与合并MP4均为稳定本地文件。示例没有制造用户评分，原项目早先的3星评审是明确记录的技术检查，不是外部用户反馈。

真实验收只证明这一组三镜头结果可用。没有审计实际账单或额度扣减，没有宣称免费额度永远有效，也没有30秒五镜头真实整项目验证。OpenAI和旧BACH仍无真实账号调用验证；旧BACH v1当前文档跳转和线上可用性限制保留。

上述原演示项目后来由用户删除；当前日常库保留完整预制 Example。本轮没有重新提交真实模型，仅复用其本地资源。

## 尚未解决与未验证

- Prompt映射与快照已验证，真实模型是否遵循新结构化Prompt、能否保持跨镜头一致性尚未用新增付费生成验证。
- 旧用户计划为保护手写内容继续显式Override；用户需主动关闭才能切回五字段编辑。没有语义冲突自动检测。
- 保存是显式操作；失败保留当前页面草稿，但未保存草稿并非跨浏览器/崩溃持久化。无自动保存。
- MP4事件表示下载响应开始，不保证文件完整落盘；旧输出和历史下载不补造事件。没有完整项目级First Cut转化率。
- First Cut仅硬切，原音可能不连续；无字幕、转场、音乐或完整时间线。
- 本地媒体和SQLite需一起备份；未缓存的过期远端链接仍可能失效，无云托管/耐久后台队列/多实例保证。
- 外部观察式用户测试、Docker运行与Railway部署尚未执行；没有需求、收益或增长结论。

## 本轮主要变更文件

| 范围                         | 文件                                                                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 编辑、默认值、保存、任务快照 | `src/lib/domain.ts`、`src/lib/service.ts`、`src/lib/client-types.ts`、`src/lib/providers/mock.ts`、`src/lib/providers/qwen.ts`                                                                                                        |
| 首剪有效性与媒体             | `src/lib/project-state.ts`、`src/lib/first-cut.ts`、`src/lib/media.ts`                                                                                                                                                                |
| 页面与高级操作               | `src/components/studio.tsx`、`scene-editor.tsx`、`media-thumbnail.tsx`、`generate-select.tsx`、`first-cut-preview.tsx`、`src/app/globals.css`                                                                                         |
| 备注、接口与指标             | `prisma/schema.prisma`、`prisma/migrations/202610180001_review_notes/migration.sql`、`src/app/api/[...path]/route.ts`、`src/lib/analytics.ts`、`src/components/analytics.tsx`                                                         |
| 验证与资源                   | `tests/experience.test.ts`、`tests/e2e/workflow.spec.ts`、`scripts/smoke-production.mjs`、`public/examples/morning-brew/project.json`、`docs/images/*.png`                                                                            |
| 产品与交付文档               | `PRODUCT_REQUIREMENTS.md`、`PRODUCT_DECISIONS.md`、`USER_TESTING.md`、`README.md`、`ARCHITECTURE.md`、`DEMO_GUIDE.md`、`REAL_API_SETUP.md`、`PORTFOLIO_CASE_STUDY.md`、`TEST_RESULTS.md`；历史审查输入保留为 `DEMO_PRODUCT_REVIEW.md` |
