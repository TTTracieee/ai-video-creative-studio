# 三分钟 Demo 指南

演示前按 README 启动，确认 FFmpeg/ffprobe 可用。首页的 Morning Brew Example 已有三个真实 Wan 3.0 片段和约 15 秒 First Cut；打开、播放和下载不调用模型。不要在演示时为展示动画重新生成付费内容。

## 0:00–0:30：任务和结果

“Frame is a brief-to-first-cut video workspace. It helps organize planning, scene choices and a reviewable draft. The value hypothesis still needs user testing.”

从 Projects 打开带 Example 标记的 Morning Brew。直接播放完整 First Cut，指出 Target 与实际时长；点击 Export MP4。这是顺序硬切的草稿，不是最终广告。

## 0:30–1:15：Plan

切到 Plan，展开 Creative brief，展示受众、目标、15 秒与 9:16。三个默认 5 秒镜头与 Creative Direction 在同一个页面。四项共享说明指导未来生成，不保证人物或包装一致性；修改不会重写已有片段。

展开 Scene direction & final prompt，说明共享与镜头级说明如何组合。展示标题、时长、排序及保存。若修改 Example，应事先 Duplicate plan，复制规划不复制模型结果。

## 1:15–2:00：Generate & Select

展示 Scene 的 Selected for cut。Other versions 属于各 Scene，Notes & details 中保留 Provider、Prompt 快照与可选评分。

说明首次成功自动选中；Generate another 不替换原选择，用户明确 Use this version 才影响初剪。不为演示额外发付费请求。可在隔离的双 Mock 测试项目演示此动作，明确说明是带水印开发素材。

## 2:00–2:35：Preview & Export

每个 Scene 选定后 Build first cut。修改选择或顺序后显示旧预览提示，Rebuild first cut 更新；合并不调用生成模型。实际时长来自源视频，Mock 测试视频三条约 9 秒，不能说成 15 秒模型输出。

展示选片序列和单一 MP4。硬切保留原音，没有转场、字幕、配乐或时间线编辑；跨镜头声音和视觉可能不连续。

## 2:35–3:00：产品判断与证据

解释迭代原因：内部亲自使用发现重复规划步骤与“只有 clips”的断点，因此新增选择和初剪，保留底层任务追踪。Workspace tools 内的 Activity / Internal analytics 是诊断工具，不是用户主任务。

说明工程测试与三镜头真实 Example 的验证边界。没有外部用户研究、效率提升或模型质量结论；下一步做观察式任务测试，而不是继续堆 AI 功能。命令与结果见 TEST_RESULTS.md。
