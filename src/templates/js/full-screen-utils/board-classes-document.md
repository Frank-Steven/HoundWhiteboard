# 白板对象文档

本文档提供白板中的 Object 对象的概述。

## Quark

Quark 类是最底层的类。

### 功能:
- 存储最底层的数据
- 直接与 canvas 交互

### 主要方法:
- `(static) parse(quark)` - 将序列化的 Quark 转化为 Quark 对象
- `listize()` - 将 Quark 对象序列化

### 主要属性:
- `transform` - 变换矩阵
- `position` - 位置向量
- `mixture` - 混合模式

### 派生类
- PolygonQuark
- TextQuark
- ImageQuark

## Polygon Quark

PolygonQuark 类是 Quark 类的派生类。

### 功能:
- 存储多边形的最底层的数据
- 直接与 canvas 交互

### 主要属性:
- `outerPoints` - 多边形的外点集

## Text Quark

TextQuark 类是 Quark 类的派生类。

### 功能:
- 存储文本框的最底层的数据
- 直接与 canvas 交互

### 主要属性:
- `text` - 文本框里的文字
- `font` - 文本的字体
- `color` - 文本的颜色
- `size` - 文本的字号

## Image Quark

ImageQuark 类是 Quark 类的派生类。

### 功能:
- 存储图片的最底层的数据
- 直接与 canvas 交互

### 主要属性:
- `src` - 图片路径
- `width` - 图片宽度
- `height` - 图片高度
