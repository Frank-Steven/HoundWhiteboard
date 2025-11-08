# 基础类型文档

本文档提供白板中基础类型对象的概述。

## Point

Point 是一个二维向量，用来表示二维平面上的一点。

### 主要方法:

- `(static) parse(p)` - 将序列化的 Point 转化为 Point 对象
- `serialize()` - 将 Point 对象序列化
- `applyTransform(trans)` - 将此对象乘上变换矩阵
- `multiplyMatrix(trans)` - 返回此对象乘变换矩阵的结果

### 主要属性:
- `x` - 点的横坐标
- `y` - 点的纵坐标

## Range

抽象类 Range 类是范围对象的基类。

### 主要方法:
- `inRange(point)` - 判断某点是否在该范围内

### 派生类:
- RectangleRange
- CircleRange
- PolygonRange

## Rectangle Range

派生于 Range 类，RectangleRange 类用以表示矩形范围。

### 主要属性:
- `position` - 矩形左上角的点的位置
- `height` - 矩形的高
- `width` - 矩形的宽

## Circle Range

派生于 Range 类，CircleRange 类用以表示圆形范围。

### 主要属性:
- `position` - 圆心位置
- `radius` - 圆半径

## Polygon Range

派生于 Range 类，PolygonRange 类用以表示任意多边形范围。

### 主要属性:
- `points` - 边界点集
