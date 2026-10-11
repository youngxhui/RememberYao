package top.youngxhui.rememberyao.ui.components

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll

/**
 * 每个推入的详情 / 表单屏共用的外框。
 *
 * 顶部一律用 Material 3 的 `TopAppBar`（含返回箭头），滚动时标题跟着收起 ——
 * 这是 Android 上「页面标题 + 返回」的标准形态，不需要自己画导航栏。
 * 底部三个 tab 根屏不用它：它们的标题由各自屏幕里的 `LargeTopAppBar` 承担。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScreenScaffold(
    title: String,
    modifier: Modifier = Modifier,
    onBack: (() -> Unit)? = null,
    // 返回箭头是可交互控件，照样要测试标识（规则 21）。由调用方给 `<屏幕>-back`，
    // 因为 ScreenScaffold 自己不知道挂在哪个屏幕下。
    backTestId: String = "screen-back",
    actions: @Composable () -> Unit = {},
    snackbarHost: @Composable () -> Unit = {},
    bottomBar: @Composable () -> Unit = {},
    floatingActionButton: @Composable () -> Unit = {},
    containerColor: Color = MaterialTheme.colorScheme.surface,
    content: @Composable (PaddingValues) -> Unit
) {
    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()
    Scaffold(
        modifier = modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        containerColor = containerColor,
        snackbarHost = snackbarHost,
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    if (onBack != null) {
                        IconButton(onClick = onBack, modifier = Modifier.testId(backTestId)) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = null
                            )
                        }
                    }
                },
                actions = { actions() },
                scrollBehavior = scrollBehavior
            )
        },
        bottomBar = bottomBar,
        floatingActionButton = floatingActionButton,
        content = content
    )
}
