// SPDX-License-Identifier: MIT
import { OperationLog } from "../operation-log.js";
import { createRedoOperation, makeOperationId } from "../operation.js";

/**
 * 构造一条合法的重做记录
 * @param {string} source - 发起者标识
 * @param {number} n - 操作序号
 * @param {number} time - 毫秒时间标记
 * @returns {import("../operation.js").OperationRecord} 分子操作记录
 */
const makeRecord = (source, n, time) =>
	createRedoOperation({ id: makeOperationId(source, n), source, time });

describe("id 分配", () => {
	test("序号从 op-1 开始，逐 source 独立", () => {
		const log = new OperationLog();
		expect(log.nextId("alice")).toBe("alice/op-1");
		expect(log.nextId("bob")).toBe("bob/op-1");
	});

	test("追加后序号推进", () => {
		const log = new OperationLog();
		log.append(makeRecord("alice", 1, 100));
		expect(log.nextId("alice")).toBe("alice/op-2");
		expect(log.nextId("bob")).toBe("bob/op-1");
	});
});

describe("追加", () => {
	test("成功追加后可按序读取", () => {
		const log = new OperationLog();
		expect(log.append(makeRecord("alice", 1, 100))).toEqual([]);
		expect(log.append(makeRecord("alice", 2, 200))).toEqual([]);
		expect(log.size).toBe(2);
		expect(log.has("alice/op-1")).toBe(true);
		expect(log.has("alice/op-9")).toBe(false);
		expect(log.get("alice/op-2").time).toBe(200);
		expect(log.get("alice/op-9")).toBeNull();
		expect(log.toArray().map((r) => r.id)).toEqual(["alice/op-1", "alice/op-2"]);
	});

	test("多 source 交错追加，各自序号独立", () => {
		const log = new OperationLog();
		expect(log.append(makeRecord("alice", 1, 100))).toEqual([]);
		expect(log.append(makeRecord("bob", 1, 150))).toEqual([]);
		expect(log.append(makeRecord("alice", 2, 200))).toEqual([]);
		expect(log.size).toBe(3);
	});

	test("非法记录被拒绝，日志保持不变", () => {
		const log = new OperationLog();
		const bad = { ...makeRecord("alice", 1, Number.NaN) };
		const errors = log.append(bad);
		expect(errors.length).toBeGreaterThan(0);
		expect(log.size).toBe(0);
	});

	test("序号跳跃被拒绝", () => {
		const log = new OperationLog();
		const errors = log.append(makeRecord("alice", 2, 100));
		expect(errors).toEqual(["id 序号不连续：期望 alice/op-1，实际 alice/op-2"]);
		expect(log.size).toBe(0);
	});

	test("序号重复被拒绝", () => {
		const log = new OperationLog();
		log.append(makeRecord("alice", 1, 100));
		const errors = log.append(makeRecord("alice", 1, 200));
		expect(errors).toEqual(["id 序号不连续：期望 alice/op-2，实际 alice/op-1"]);
		expect(log.size).toBe(1);
		expect(log.get("alice/op-1").time).toBe(100);
	});

	test("toArray 返回副本", () => {
		const log = new OperationLog();
		log.append(makeRecord("alice", 1, 100));
		log.toArray().push(makeRecord("alice", 2, 200));
		expect(log.size).toBe(1);
	});
});

describe("全序视图", () => {
	test("按时间标记（时钟环）排序，同毫秒按 author 字典序", () => {
		const log = new OperationLog();
		log.append(makeRecord("bob", 1, 50));
		log.append(makeRecord("alice", 1, 75));
		log.append(makeRecord("bob", 2, 75));
		log.append(makeRecord("alice", 2, 100));
		expect(log.toSortedArray().map((r) => r.id)).toEqual([
			"bob/op-1",
			"alice/op-1",
			"bob/op-2",
			"alice/op-2",
		]);
	});

	test("时间标记回拨被拒绝，日志保持不变；等时不算回拨", () => {
		const log = new OperationLog();
		log.append(makeRecord("alice", 1, 100));
		expect(log.append(makeRecord("alice", 2, 50))).toEqual([
			"时间标记回拨：alice 的已追加记录最晚为 100，实际 50",
		]);
		expect(log.size).toBe(1);
		expect(log.append(makeRecord("alice", 2, 100))).toEqual([]);
	});

	test("追加序不被排序影响", () => {
		const log = new OperationLog();
		log.append(makeRecord("alice", 1, 100));
		log.append(makeRecord("bob", 1, 50));
		expect(log.toArray().map((r) => r.id)).toEqual(["alice/op-1", "bob/op-1"]);
	});
});

describe("序列化", () => {
	test("toJSON/fromJSON 往返一致，计数器恢复", () => {
		const log = new OperationLog();
		log.append(makeRecord("alice", 1, 100));
		log.append(makeRecord("bob", 1, 150));
		log.append(makeRecord("alice", 2, 200));
		const restored = OperationLog.fromJSON(JSON.parse(JSON.stringify(log)));
		expect(restored.toArray()).toEqual(log.toArray());
		expect(restored.nextId("alice")).toBe("alice/op-3");
		expect(restored.nextId("bob")).toBe("bob/op-2");
		expect(restored.append(makeRecord("alice", 3, 300))).toEqual([]);
	});

	test("损坏数据抛出合并错误", () => {
		expect(() => OperationLog.fromJSON("nope")).toThrow("序列化数据必须是记录数组");
		expect(() => OperationLog.fromJSON([makeRecord("alice", 2, 100)])).toThrow("id 序号不连续");
	});

	test("空数组重建为空日志", () => {
		const log = OperationLog.fromJSON([]);
		expect(log.size).toBe(0);
		expect(log.nextId("alice")).toBe("alice/op-1");
	});
});
