package top.youngxhui.rememberyao.core.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import top.youngxhui.rememberyao.core.model.Medication
import top.youngxhui.rememberyao.core.model.MedicationCategory
import top.youngxhui.rememberyao.core.model.MedicationPlan
import top.youngxhui.rememberyao.core.model.MedicationType
import top.youngxhui.rememberyao.core.model.MedicationUnit
import top.youngxhui.rememberyao.core.model.StockLevel

/**
 * 领域层纯函数的行为锁定。
 *
 * 这些是两端契约（见 `newarchive/docs/domain-spec.md`）里最容易被一次「顺手优化」
 * 改坏的部分：hash 取色、库存档位、配置生效、宽限期。改这里的期望值前先读规格。
 */
class DomainTest {

    // MARK: - stableHash：必须与 iOS 的 Int32 回绕语义逐位一致

    @Test
    fun `stableHash 与 iOS 的 Int32 回绕一致`() {
        // 这几个数是按 iOS 的算法（h: Int32，h &* 31 &+ Int32(unit)）算出来的，
        // 逐位相等才算两端对齐。UUID 会把 31 倍滚动 hash 推过 32 位，
        // 正好压住回绕语义 —— 不按 Int32 截断的话这里会是 1.5e54 这种数
        assertEquals(1_891_949_682, stableHash("a1b2c3d4-e5f6-7890-abcd-ef1234567890"))
        assertEquals(775_167, stableHash("张伟"))
        assertEquals(97, stableHash("a"))
        // 短字符串不溢出，回不回绕都一样
        assertEquals(3_208_415, stableHash("home"))
        assertEquals(26_446, stableHash("李"))
    }

    @Test
    fun `stableHash 非负且同名同值`() {
        repeat(50) { i ->
            val name = "成员$i"
            val first = stableHash(name)
            assertTrue("$name 得到负 hash", first >= 0)
            assertEquals(first, stableHash(name))
        }
    }

    // MARK: - 库存档位

    @Test
    fun `stockLevel 按剩余比例分档`() {
        fun med(total: Int, remaining: Int) = Medication(
            id = "m", name = "n", type = MedicationType.BOTTLE,
            category = MedicationCategory.CHRONIC,
            specification = "", unit = MedicationUnit.TABLET,
            totalQuantity = total, remainingQuantity = remaining,
            expiryDate = null, prescription = false, notes = "",
            createdAt = "", updatedAt = ""
        )
        assertEquals(StockLevel.CRITICAL, med(100, 10).stockLevel)
        assertEquals(StockLevel.LOW, med(100, 20).stockLevel)
        assertEquals(StockLevel.OK, med(100, 80).stockLevel)
        // 总量为 0 时不能除零
        assertEquals(StockLevel.CRITICAL, med(0, 0).stockLevel)
    }

    // MARK: - 配置生效

    @Test
    fun `isActive 尊重开关与起止日期`() {
        fun plan(start: String, end: String?, enabled: Boolean = true) = MedicationPlan(
            id = "p", medicationId = "m", personId = "u", doseAmount = 1,
            times = listOf("08:00"), startDate = start, endDate = end, enabled = enabled,
            createdAt = "", updatedAt = ""
        )
        assertTrue(plan("2026-01-01", null).isActive("2026-10-11"))
        assertFalse(plan("2026-01-01", null).isActive("2025-12-31"))
        assertTrue(plan("2026-01-01", "2026-12-31").isActive("2026-12-31"))
        assertFalse(plan("2026-01-01", "2026-12-31").isActive("2027-01-01"))
        assertFalse(plan("2026-01-01", null, enabled = false).isActive("2026-10-11"))
    }

    // MARK: - 日期键

    @Test
    fun `addDays 跨月跨年正确`() {
        assertEquals("2026-03-01", DateKey.addDays("2026-02-28", 1))
        assertEquals("2027-01-01", DateKey.addDays("2026-12-31", 1))
        assertEquals("2026-10-04", DateKey.addDays("2026-10-11", -7))
        // 非法输入原样返回，不抛
        assertEquals("not-a-date", DateKey.addDays("not-a-date", 1))
    }
}
