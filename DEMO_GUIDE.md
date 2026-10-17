# 三分钟 Demo 指南

## 演示前

运行 README 的本地启动步骤。默认使用 Mock，不需要 API Key。演示样例与真实用户数据分开；不要把自己的操作称作市场验证。

## 0:00–0:25：问题与假设

“This is a marketing-oriented creative workspace. The hypothesis is that structured planning and shared visual instructions can make the process easier to manage. I have not validated that hypothesis with user interviews yet.”

点击 Overview 的 **Try the coffee campaign**。这是明确标注 Sample 的项目。

## 0:25–1:10：Brief 与分镜

展示 Morning Brew 的受众、营销目标、15 秒和 9:16。点击 **Generate storyboard**，说明 Mock 使用模板，不调用模型。展示三个 5 秒镜头；15 秒是规划，不是自动合成视频。

## 1:10–1:45：共享说明与编辑

在 **Visual Consistency Profile** 修改 Character Identity，点击 **Save profile**。展开镜头的最终 Prompt，展示共享说明如何自动组合。修改 Scene Title 或 Prompt，保存或 Rewrite 一个镜头。说明这是 Prompt 层面的指导，不保证模型输出一致性。

## 1:45–2:25：异步任务与 Review

点击 **Generate clip**，展示 Pending → Processing → Completed；刷新后记录仍在。固定视频有 Mock 水印，不能当作 AI 生成结果。评分并提交反馈；用 Mock scenario 展示失败与重试，指出旧尝试被保留。

## 2:25–3:00：数据与产品反思

导出项目 JSON。展示 Analytics 的来源和模式筛选、终态成功率及评分。说明产品取舍：先固定工作流而非专业剪辑；下一步通过用户任务测试评估共享说明是否有用，再决定是否接入参考素材。

真实 Qwen/万相/OpenAI/BACH 调用、Railway 部署及外部用户测试是否完成，以 TEST_RESULTS.md 的实际记录为准，不在面试中推断已完成。

真实 API 演示采用 REAL_API_SETUP.md 的步骤。录屏前先完成一次真实分镜和单镜头生成验收；没有 Key 或只有协议测试时，不将 Mock MP4 说成模型生成。15 秒三个 5 秒镜头可用万相 2.2；30 秒默认五个 6 秒镜头需选择万相 2.6，或明确编辑为六个 5 秒镜头。
