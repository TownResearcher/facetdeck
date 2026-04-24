# FacetDeck

> The open-source Vibe Coding slide engine for web-native presentations.  
> 开源的 Vibe Coding 幻灯片引擎，专为网页原生演示而生。

[Official Website](https://facetdeck.com) · [GitHub Repo](https://github.com/TownResearcher/facetdeck.git)

---

## 中文介绍

别再被“一锤子买卖”的 AI PPT 工具限制创作。  
**FacetDeck** 的核心理念是：让大模型做它最擅长的事（写前端代码），同时把演示体验做成真正可控、可编辑、可离线的网页级幻灯片。

### 为什么是 FacetDeck？

- **真正可控的 Vibe 工作流**：不是黑盒一键生成，而是可干预、可迭代的结构化流程。
- **自带素材理解能力**：在生成大纲阶段即可识别并匹配你上传的图片素材。
- **拒绝一锤子买卖**：支持对话修改、面板精修、代码直改三种不同维度的微调。
- **死磕演示稳定性**：锁定 16:9，避免网页演示在不同屏幕下错位、溢出和滚动条。
- **离线可播放**：支持导出静态 HTML，断网环境仍可完整展示动态效果。

### 产品画面（图1-图7）

![图1 - FacetDeck 截图](facetdeck_material/图1.png)
![图2 - FacetDeck 截图](facetdeck_material/图2.png)

![图3 - Setup 工作流](facetdeck_material/图3.png)
![图4 - Setup 工作流](facetdeck_material/图4.png)

![图5 - 编辑器三重微调](facetdeck_material/图5.png)
![图6 - 编辑器三重微调](facetdeck_material/图6.png)
![图7 - 编辑器三重微调](facetdeck_material/图7.png)

### 三重微调能力

- **A. 对话微调（Vibe 模式）**  
  选中元素或整页，直接用自然语言让 AI 改风格、改结构、改文案。
- **B. 属性面板（UI 模式）**  
  像使用 Figma 一样进行可视化精准调节，包括文本、图片、配色与位置。
- **C. 代码直修（Code 模式）**  
  直接编辑底层 HTML，实时渲染预览，适合高级用户和插件开发者。

### 开源与费用

- 项目开源，License 为 `AGPL-3.0-or-later`。
- 你可以自托管并接入自己的模型 API Key。
- 使用自有模型密钥时，FacetDeck 本体不额外收费。
- 也支持托管模式，便于不想维护基础设施的团队快速上手。

---

## English Overview

Stop using one-shot AI PPT tools that lock you in.  
**FacetDeck** is built around a different principle: let LLMs do what they do best (generate frontend code), while giving creators full control over layout, iteration, and delivery.

### Why FacetDeck?

- **Structured Vibe workflow** instead of a black-box "generate once" flow.
- **Material-aware outline generation** that can place your uploaded assets on the right slides.
- **Three-level editing model** for fast iteration: chat, visual panel, and direct code editing.
- **Presentation-safe rendering** with strict 16:9 constraints across screens and projectors.
- **Offline-ready output** with static HTML export while keeping web-native interactions.

### Product Visuals (Fig.1-Fig.7)

![Figure 1 - FacetDeck screenshot](facetdeck_material/图1.png)
![Figure 2 - FacetDeck screenshot](facetdeck_material/图2.png)

![Figure 3 - Setup workflow](facetdeck_material/图3.png)
![Figure 4 - Setup workflow](facetdeck_material/图4.png)

![Figure 5 - Triple editing modes](facetdeck_material/图5.png)
![Figure 6 - Triple editing modes](facetdeck_material/图6.png)
![Figure 7 - Triple editing modes](facetdeck_material/图7.png)

### Triple Editing Modes

- **A. Chat Refinement (Vibe Mode)**  
  Use natural language to revise selected elements or full slides.
- **B. Visual Refinement (UI Mode)**  
  Fine-tune content and styling with direct manipulation, Figma-style.
- **C. Code Refinement (Code Mode)**  
  Edit slide HTML directly with instant visual feedback.

---

## Quick Start

### Prerequisites

- Node.js 18+ (latest LTS recommended)
- npm 9+

### Local Development

1. Install dependencies
   - `npm install`
2. Create env file
   - Copy `.env.example` to `.env`
   - Fill required values (`RESEND_API_KEY`, `RESEND_FROM`, `JWT_SECRET`, etc.)
   - For open-source mode, set:
     - `FACETDECK_DISTRIBUTION_MODE=oss`
     - `VITE_FACETDECK_MODE=oss`
3. Start full stack
   - `npm run dev:full`

Run separately if needed:

- API only: `npm run dev:api`
- Frontend only: `npm run dev`

Build for production:

- `npm run build`

---

## Project Structure

- `src/` - frontend application
- `server/` - backend/auth APIs
- `examples/` - sample projects (including plugin example)
- `guidelines/` - generation/style guideline sources
- `docs/` - curated docs index and archived guides

---

## Plugin Development

- Full SDK reference: `PLUGIN_SDK.md`
- Chinese quickstart: `PLUGIN_SDK_QUICKSTART_ZH.md`
- Runnable sample: `examples/facetdeck-plugin-vite-sample/`

---

## Documentation & Policies

- Docs index: `docs/README.md`
- Contributing: `CONTRIBUTING.md`
- Security: `SECURITY.md`
- Open source policy: `OPEN_SOURCE_POLICY.md`
- Trademark policy: `TRADEMARK_POLICY.md`
- Changelog: `CHANGELOG.md`

---

## Contact

- Email: `shaungladtoseeu@gmail.com`

Special thanks to `zarazhangrui` and the open-source `frontend-slides` project for inspiration.

---

## License

Licensed under `AGPL-3.0-or-later`. See `LICENSE`.