import { IncrementalIdPool } from "../incremental-id-pool.js";

describe("IncrementalIdPool", () => {
  test("无来源时分配纯数字字符串 id", () => {
    const pool = new IncrementalIdPool();

    expect(pool.allocate()).toBe("1");
    expect(pool.allocate()).toBe("2");
  });

  test("有来源时 id 携带来源前缀", () => {
    const pool = new IncrementalIdPool("zhouc_yu");

    expect(pool.allocate()).toBe("zhouc_yu/1");
    expect(pool.allocate()).toBe("zhouc_yu/2");
  });

  test("来源可嵌套", () => {
    const pool = new IncrementalIdPool("zhouc_yu/core");

    expect(pool.allocate()).toBe("zhouc_yu/core/1");
  });

  test("计数从指定起始值递增且不回退", () => {
    const pool = new IncrementalIdPool("core", 41);

    expect(pool.allocate()).toBe("core/42");
    expect(pool.allocate()).toBe("core/43");
  });
});
