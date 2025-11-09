# TODO

### [data](../data)
- 这个文件不应该在源码里。应该是在安装的时候放在 .config 里。但是现在（开发时）我们暂时不将其移出。

### [new-file](../src/templates/js/new-file.js)
- 在创建新文件的时候，应该让用户选择宽高比（或是宽高的像素）

### [new-texture](../src/templates/js/new-texture.js)
- 创建这个文件。
- 写 UI。
- 美化 UI。
- 写自建纹理的文档。

### [new-file-template-context-menu.js](../src/templates/js/new-file-template-context-menu.js)
- 利用伪窗口类，做“真的要删除吗？”提示框。

### [new-file-template-rename.js](../src/templates/js/new-file-template-rename.js)
- 利用伪窗口类重写。

### UI
- 美化 UI。

### [template-manager.js](../src/components/template-manager.js)
- 将 meta 里的 hash 作为 template 的唯一标识。

### [texture-manager.js](../src/components/texture-manager.js)
- 将 meta 里的 hash 作为 texture 的唯一标识。

### 文件操作
- 文件操作能在渲染进程中操作的就尽量在渲染进程中操作。
