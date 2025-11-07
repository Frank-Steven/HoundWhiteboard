# 白板对象文档

本文档提供白板中各种对象的概述。

## Quark

Quark 类是最底层的类。用来存储最底层的数据，通过 [RenderManager](render-manager.js) 直接与 canvas 交互。

### 主要方法:
- `(static) parse(quark)` - 将序列化的 Quark 转化为 Quark 对象
- `serialize()` - 将 Quark 对象序列化

### 主要属性:
- `transform` - 变换矩阵
- `position` - 位置向量 (`Point` 类)
- `mixture` - 混合模式

### 派生类
- PolygonQuark
- TextQuark
- ImageQuark

## Polygon Quark

PolygonQuark 类是 Quark 类的派生类。用来存储多边形的最底层的数据。

### 主要属性:
- `outerPoints` - 多边形的外点集

## Text Quark

TextQuark 类是 Quark 类的派生类。用来存储文本框的最底层的数据。

### 主要属性:
- `text` - 文本框里的文字
- `font` - 文本的字体
- `color` - 文本的颜色
- `size` - 文本的字号

## Image Quark

ImageQuark 类是 Quark 类的派生类。

### 功能:
- 存储图片的最底层的数据

### 主要属性:
- `src` - 图片路径
- `width` - 图片宽度
- `height` - 图片高度

## Basic Object

抽象类 BasicObject 是白板上所有高级对象的基类。

### 主要属性:
- `position` - 对象的位置 (下文中的坐标默认相对于该位置)
- `transform` - 对象的变换矩阵 (下文中的坐标默认是在 $\begin{bmatrix}1&0\\0&1\end{bmatrix}$ 下)
- `rectangle` - 对象的矩形范围
- `center` - 对象的几何中心
- `convexHull` - 对象的凸包
- `isDirection` - 是否是有向对象
- `rotateCenter` - 对象的旋转中心

### 主要方法:
- `applyTransform(matrix)` - 应用变换矩阵
- `getQuarks()` - 获取该对象下的 Quark 对象

### 派生类:
- ZeroDimensionObject
- OneDimensionObject
- TwoDimensionObject

## Zero Dimension Object

抽象类 ZeroDimensionObject 是所有零维对象的基类。

零维对象是指无法调节其宽度和高度的对象。欲达到类似调节宽高的效果，请使用变换矩阵。

### 派生类:
- Container

## One Dimension Object

抽象类 OneDimensionObject 是所有一维对象的基类。

一维对象是指高度和宽度只能调节其一的对象。欲达到类似调节另一维长的效果，请使用变换矩阵。将一维对象装在容器里面可以避免逻辑混乱。

### 主要属性:
- `isMainAxisX` - 对象的主轴是否是 x 轴，即是否只可调节宽度而不可调节高度

## Two Dimension Object

抽象类 TwoDimensionObject 是所有二维对象的基类。

## Container

Container 类是用来包装一、二维对象的容器类。派生于 ZeroDimensionObject。

一、二维对象既可以调节变换矩阵，又可以调节对象原本的宽高的逻辑歇脚造成混乱。所以我们用 Container 包装之，并赋予了 Container 容器多种模式以适应不同的对象调节逻辑。

### 主要模式:

### 主要属性:
