# FIXME

### [settings-manager.js](../src/components/setting-manager.js)
- 改造 settings 存储方式，并支持 nativeTheme。

内置模块nativeTheme.themeSource可以获取当前的应用主题，有‘light’,'dark','system'，其中‘system’仅在macos中支持；

一、通过修改nativeTheme.themeSource来实现主题切换；
```javascript
const { nativeTheme } = require('electron');
 
// 白天主题
nativeTheme.themeSource = 'light';
 
// 黑夜主题
nativeTheme.themeSource = 'dark';
```

二、渲染进程中对应css编写

```css
/* 对应的‘light’主题 */
@media (prefers-color-scheme: light) {
  body {
    background-color: rgb(255, 255, 255);
  }
}
 
/* 对应的‘dark’主题 */
@media (prefers-color-scheme: dark) {
  body {
    background-color: rgb(0, 0, 0);
  }
}
```

当nativeTheme.themeSource设置为‘light’时，渲染进程的css文件会引用‘light’的配置样式，反之同理；

自此，Electron简单的两种主题就实现了。

### [window-manager.js](../src/components/window-manager.js)
- 模态窗口出问题了。请检查。

### utils 和 components 应该分开来
- 目前 utils 和 components 都放在一起，应该分开来。（已完成 Frank-Steven 2025-11-09）
- utils 放一些工具类，components 放一些公共组件。
- 根据 **《人月神话》** ，组件应该和业务相关，工具类应该和业务无关，并且工具类应该尽量抽象，并对一些常用功能进行封装，以提高代码复用性，同时保证代码具有优秀的实现。
- 工具类不需要依赖业务组件，业务组件可以依赖工具类。
- 工具类在实现时需要有限考虑性能，并考虑到易用性和可维护性。
- 工具类应该有单元测试，并在测试中覆盖常用功能。
- 工具类应该有文档，并在文档中说明如何使用。