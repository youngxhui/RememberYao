package top.youngxhui.rememberyao.ui

import android.Manifest
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.GrantPermissionRule
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import top.youngxhui.rememberyao.MainActivity

/**
 * 底部 tab 栏：恰好三个标签，且每个都能点进去。
 *
 * 与 iOS 的 `RememberYaoUITests/TabsUITest.swift` 断言同一件事：tab 数量、点击后的
 * 选中态、目标屏真的亮出来。
 *
 * 冷启动有两个状况会挡在 tab 前面，必须先处理掉：
 * - 通知权限：`RequestNotificationPermissionOnce` 一进首页就弹系统申请框，盖在 tab 栏
 *   上面，点击全被对话框吃掉；
 * - 引导页：首次启动 `startDestination` 落在引导页，tab 栏还没出现。
 */
@RunWith(AndroidJUnit4::class)
class TabsUiTest {

    private val grantPermissionRule =
        GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS)
    private val composeTestRule = createAndroidComposeRule<MainActivity>()

    // 用 RuleChain 把顺序钉死：JUnit 的多个 @Rule 字段是按**字段名字母序**套层的，
    // 声明顺序说了不算（composeTestRule 就排在 permissionRule 前面）。这里必须
    // 「先授权限、再拉 Activity」，晚了权限框已经盖在界面上了。
    @get:Rule
    val rules: TestRule = RuleChain.outerRule(grantPermissionRule).around(composeTestRule)

    @Test
    fun testTabs() {
        skipOnboardingIfFirstLaunch()

        // 引导页 → 主界面有转场，等底部导航栏真的出现
        composeTestRule.waitUntil("底部导航栏出现", 5_000) {
            composeTestRule.onAllNodes(isTabItem).fetchSemanticsNodes(
                atLeastOneRootRequired = false
            ).isNotEmpty()
        }

        // 恰好三个 tab：多一个少一个都算回归
        composeTestRule.onAllNodes(isTabItem).assertCountEquals(3)

        // 顺序与 RememberYaoApp 里 TopLevel 枚举一致：首页 → 药品 → 我的。
        // 每个 tab 配一个该屏独有的控件做落地凭证 —— 只断言选中态的话，
        // 「点了却没跳转」会被漏掉。
        val tabs = listOf("tab-home", "tab-medica", "tab-profile")
        val markers = listOf("home-top-bar", "medica-add-button", "profile-settings-button")

        tabs.forEachIndexed { index, tag ->
            val tab = composeTestRule.onNodeWithTag(tag)
            tab.performClick()
            composeTestRule.waitForIdle()
            tab.assertIsSelected()
            composeTestRule.waitUntil("切到 $tag", 5_000) {
                composeTestRule.onAllNodesWithTag(markers[index]).fetchSemanticsNodes(
                    atLeastOneRootRequired = false
                ).isNotEmpty()
            }
            composeTestRule.onNodeWithTag(markers[index]).assertIsDisplayed()
        }
    }

    /** 首次启动会落在引导页：点右上角「跳过」一步进主界面。 */
    private fun skipOnboardingIfFirstLaunch() {
        val skip = composeTestRule.onAllNodesWithTag("onboarding-skip")
        if (skip.fetchSemanticsNodes(atLeastOneRootRequired = false).isNotEmpty()) {
            composeTestRule.onNodeWithTag("onboarding-skip").performClick()
        }
    }
}

/**
 * 底部 tab 项：tag 以 `tab-` 开头的节点。
 *
 * 按前缀匹配而不是逐个 tag 列举，才能真的数出「一共几个 tab」。Material3 的
 * NavigationBarItem 内部只加了 `selectable`、没有 `mergeDescendants`，各项在合并
 * 语义树里各自成节点，所以这条 matcher 数到的就是 tab 个数。
 */
private val isTabItem = SemanticsMatcher("底部 tab 项") { node ->
    node.config.getOrElseNullable(SemanticsProperties.TestTag) { null }
        ?.startsWith("tab-") == true
}
