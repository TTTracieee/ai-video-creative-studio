# Demo 素材与现场演示指南

## 已录制的 GitHub Demo（2026-10-19）

- [完整操作视频](docs/demo/frame-demo.mp4)：67秒、约1.4MB，英文步骤提示，静音录屏；复用此前生成的真实 Qwen/Wan 片段，实际编辑、保存、选片、FFmpeg合并和下载MP4。
- [README短动图](docs/demo/preview.gif)：20秒、约3.2MB，从完整视频摘取关键操作；不是另一套界面原型。
- [封面](docs/demo/poster.jpg) / [录制验证与章节](docs/demo/recording.json)。

录制在临时数据库和本地3300端口的生产实例中进行，不修改日常项目。服务端使用Mock配置并清空外部模型密钥，浏览器额外阻止生成/重试/分镜请求；仅复用仓库已有真实媒体。录制字幕是演示提示，不是新增的应用功能。

重新录制：

```bash
npm run build
npx playwright install ffmpeg
node scripts/record-demo.mjs
```

脚本优先使用macOS已有Google Chrome；没有时先运行 `npx playwright install chromium`。需要系统FFmpeg/ffprobe，输出会覆盖docs/demo中的素材。录制验证实际Final Prompt映射、保存、三次选片、初剪播放与有效MP4下载；自动清理临时数据库、原始录屏和合并文件。

README使用仓库内GIF直接展示，并链接完整MP4。参见[GitHub支持的媒体格式说明](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)。保留仓库现有私有权限；外部访客需要仓库访问权。

## 三分钟现场演示

演示前按 README 启动，确认 FFmpeg/ffprobe 可用。首页的 Morning Brew Example 已有三个真实 Wan 3.0 片段和约 15 秒 First Cut；打开、播放和下载不调用模型。不要在演示时为展示动画重新生成付费内容。

## 0:00–0:30：任务和结果

“Frame is a brief-to-first-cut video workspace. It helps organize planning, scene choices and a reviewable draft. The value hypothesis still needs user testing.”

从 Projects 打开带 Example 标记的 Morning Brew。直接播放完整 First Cut，指出 Target 与实际时长；点击 Export MP4。这是顺序硬切的草稿，不是最终广告。

## 0:30–1:15：Plan

切到 Plan，展开 Creative brief，展示受众、目标、15 秒与 9:16。三个默认 5 秒镜头与 Creative Direction 在同一个页面。四项共享说明指导未来生成，不保证人物或包装一致性；修改不会重写已有片段。

直接修改 Visual Description、Subject、Camera Movement、Lighting 或 Mood，展开 Advanced · Prompt & override 验证 Final Prompt 同步变化。共享档案始终参与；Override 是显式高级切换。展示 Unsaved 区域和统一 Save Plan，说明保存失败保留草稿，改文字不改变旧视频。若修改 Example，应事先 Duplicate plan，复制规划不复制模型结果。

## 1:15–2:00：Generate & Select

展示 Scene 的 Selected for cut。Other versions 属于各 Scene，Notes & details 中保留 Provider、Prompt 快照与可选私人的 Review Notes。

说明首次成功自动选中；Generate another 不替换原选择，用户明确 Use this version 才影响初剪。不为演示额外发付费请求。可在隔离的双 Mock 测试项目演示此动作，明确说明是带水印开发素材。

## 2:00–2:35：Preview & Export

每个 Scene 选定后 Build first cut。修改选择或顺序后显示旧预览提示，Update first cut 更新；合并不调用生成模型。实际时长来自源视频，Mock 测试视频三条约 9 秒，不能说成 15 秒模型输出。

完成态的主要操作是顶部 Export MP4；改项目名称不要求重建。JSON 和全量重写位于 More。展示选片序列和单一 MP4。硬切保留原音，没有转场、字幕、配乐或时间线编辑；跨镜头声音和视觉可能不连续。

## 2:35–3:00：产品判断与证据

解释迭代原因：内部亲自使用发现重复规划步骤与“只有 clips”的断点，因此新增选择和初剪，保留底层任务追踪。Workspace tools 内的 Activity / Internal analytics 是诊断工具，不是用户主任务。

说明工程测试与三镜头真实 Example 的验证边界。没有外部用户研究、效率提升或模型质量结论；下一步做观察式任务测试，而不是继续堆 AI 功能。命令与结果见 TEST_RESULTS.md。
