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

### 增加 config-manager 组件（从以下功能中选择或者扩充）

目的：把 data 目录的操作从其他组件中抽离出来，单独创建一个 config-manager 组件，用于管理应用的配置。并为后期提供将 data 目录迁移到其他位置的功能（如云端、USB、Portable 应用等）提前做好准备。

- 增加 config-manager 组件，用于管理应用的配置。
- 包括：
  - 应用的基本信息（名称、版本号、描述、作者、许可证等）
  - 应用的主题（包括颜色、字体、布局等）
  - 应用的插件（包括已安装的插件列表、插件的安装、卸载、启用、禁用等）
  - 应用的快捷键（包括全局快捷键、窗口快捷键等）
- 应用的配置信息应该存储在本地，并提供接口以便其他组件读取和修改。
- 应用的配置信息应该有默认值，并且可以根据用户的操作进行修改。
- 应用的配置信息应该有保存和恢复的功能，以便用户可以恢复默认配置。
- 应用的配置信息应该有备份功能，以便用户可以备份当前的配置。
- 应用的配置信息应该有导入和导出功能，以便用户可以导入或导出其他用户的配置。
- 应用的配置信息应该有校验功能，以便用户可以检查配置是否正确。
- 应用的配置信息应该有加密功能，以便用户可以保护敏感信息。
- 应用的配置信息应该有权限控制，以便用户可以控制对配置的访问权限。
