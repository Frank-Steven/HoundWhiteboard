# FIXME

### [settings-manager.js](../src/components/setting-manager.js)
- 改造 settings 存储方式，并支持 nativeTheme。

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