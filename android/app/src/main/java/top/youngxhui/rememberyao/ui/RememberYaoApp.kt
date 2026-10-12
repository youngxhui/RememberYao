package top.youngxhui.rememberyao.ui

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.AnimatedContentTransitionScope.SlideDirection
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Medication
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.IntOffset
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import top.youngxhui.rememberyao.R
import top.youngxhui.rememberyao.core.l10n.Prefs
import top.youngxhui.rememberyao.ui.components.testId
import top.youngxhui.rememberyao.ui.home.HomeScreen
import top.youngxhui.rememberyao.ui.medica.BlisterTwinScreen
import top.youngxhui.rememberyao.ui.medica.MedicaDetailScreen
import top.youngxhui.rememberyao.ui.medica.MedicaFormScreen
import top.youngxhui.rememberyao.ui.medica.MedicaListScreen
import top.youngxhui.rememberyao.ui.onboarding.OnboardingScreen
import top.youngxhui.rememberyao.ui.profile.PersonDetailScreen
import top.youngxhui.rememberyao.ui.profile.PersonsScreen
import top.youngxhui.rememberyao.ui.profile.PlanFormScreen
import top.youngxhui.rememberyao.ui.profile.ProfileScreen
import top.youngxhui.rememberyao.ui.profile.SettingsScreen
import top.youngxhui.rememberyao.ui.records.RecordsScreen

/** 路由表集中一处：路径段、参数名、构造 helper 都在这里，屏幕里不拼字符串。 */
object Routes {
    const val ONBOARDING = "onboarding"
    const val HOME = "home"
    const val MEDICA = "medica"
    const val PROFILE = "profile"

    const val RECORDS = "records"
    const val SETTINGS = "settings"
    const val PERSONS = "persons"

    const val ARG_MEDICATION_ID = "medicationId"
    const val ARG_PERSON_ID = "personId"
    const val ARG_PLAN_ID = "planId"

    const val MEDICA_DETAIL = "medica/detail/{$ARG_MEDICATION_ID}"
    const val MEDICA_FORM = "medica/form?$ARG_MEDICATION_ID={$ARG_MEDICATION_ID}"
    const val MEDICA_TWIN = "medica/twin/{$ARG_MEDICATION_ID}"
    const val PERSON_DETAIL = "person/detail/{$ARG_PERSON_ID}"
    const val PLAN_FORM =
        "plan/form?$ARG_PLAN_ID={$ARG_PLAN_ID}&$ARG_PERSON_ID={$ARG_PERSON_ID}&$ARG_MEDICATION_ID={$ARG_MEDICATION_ID}"

    /** 新建表单：不传 id（空串即「新建」）。 */
    fun medicaForm(medicationId: String? = null) = "medica/form?$ARG_MEDICATION_ID=${medicationId.orEmpty()}"

    fun medicaDetail(medicationId: String) = "medica/detail/$medicationId"

    fun medicaTwin(medicationId: String) = "medica/twin/$medicationId"

    fun personDetail(personId: String) = "person/detail/$personId"

    /** 编辑某笔配置；新建时只给 personId / medicationId 作为初始值。 */
    fun planForm(planId: String? = null, personId: String? = null, medicationId: String? = null) =
        "plan/form?$ARG_PLAN_ID=${planId.orEmpty()}" +
            "&$ARG_PERSON_ID=${personId.orEmpty()}" +
            "&$ARG_MEDICATION_ID=${medicationId.orEmpty()}"
}

/** 底部三个 tab。顺序即展示顺序，与设计稿一致。 */
private enum class TopLevel(
    val route: String,
    val labelRes: Int,
    val testId: String,
    val selectedIcon: ImageVector,
    val icon: ImageVector
) {
    HOME(
        route = Routes.HOME,
        labelRes = R.string.nav_home,
        testId = "tab-home",
        selectedIcon = Icons.Filled.Home,
        icon = Icons.Outlined.Home
    ),
    MEDICA(
        route = Routes.MEDICA,
        labelRes = R.string.nav_medica,
        testId = "tab-medica",
        selectedIcon = Icons.Filled.Medication,
        icon = Icons.Outlined.Medication
    ),
    PROFILE(
        route = Routes.PROFILE,
        labelRes = R.string.nav_profile,
        testId = "tab-profile",
        selectedIcon = Icons.Filled.Person,
        icon = Icons.Outlined.Person
    )
}

/** tab 的排列顺序：决定左右滑动的方向（设计稿的行为节）。 */
private val TabRoutes = listOf(Routes.HOME, Routes.MEDICA, Routes.PROFILE)

/**
 * 推入屏归属哪个 tab：设置属于「我的」，药品表单属于「药品」。
 *
 * 底部导航栏在这两屏上也显示（设计稿如此），选中态跟着归属 tab 走；
 * 更深的详情 / 表单屏不占 tab 位，导航栏隐藏。
 */
private fun owningTab(route: String?): String? = when (route) {
    Routes.SETTINGS -> Routes.PROFILE
    Routes.MEDICA_FORM -> Routes.MEDICA
    else -> route
}

/**
 * 应用外壳：底部 tab + 全屏导航。
 *
 * 只有一个 Activity（Android 单 Activity 架构的标准做法），页面切换全部交给
 * Navigation Compose。`AppViewModel` 提到这里取一次，三个 tab 与推入的详情页
 * 共享同一份数据快照。
 *
 * 屏幕过渡跟随 `MotionScheme.expressive()`：tab 之间按排列方向左右滑入
 * （右边的 tab 从右进，左边的从左进），推入屏从右进、返回反向，药品表单
 * 从底部进。过渡 lambda 本身不是 @Composable，读不到 MaterialTheme，所以
 * 在可组合作用域取一次 specs 让它们闭包捕获。
 */
@Composable
fun RememberYaoApp() {
    val viewModel: AppViewModel = hiltViewModel()
    val navController = rememberNavController()
    val context = LocalContext.current

    var onboardingDone by remember { mutableStateOf(Prefs.onboardingDone(context)) }

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val activeTab = owningTab(currentRoute)
    val showBottomBar = TabRoutes.any { it == activeTab }

    // 首屏拉一次通知权限：Android 13+ 不弹框就永远收不到提醒。
    // 只问一次，用户拒了之后不再骚扰（设置页里说明原因，由用户自己去系统里开）。
    if (onboardingDone) {
        RequestNotificationPermissionOnce()
    }

    val slideSpec: FiniteAnimationSpec<IntOffset> = MaterialTheme.motionScheme.defaultSpatialSpec()

    // tab 之间：目标 tab 在右侧 → 从右滑入；在左侧 → 从左滑入。
    // 与推入屏交互（盖住 / 返回）时方向固定：盖住向左走，返回从左侧滑回。
    val tabEnter: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition? = {
        val from = TabRoutes.indexOf(initialState.destination.route)
        val to = TabRoutes.indexOf(targetState.destination.route)
        if (from >= 0 && to >= 0) {
            slideIntoContainer(
                towards = if (to > from) SlideDirection.Left else SlideDirection.Right,
                animationSpec = slideSpec
            )
        } else {
            slideIntoContainer(SlideDirection.Right, animationSpec = slideSpec)
        }
    }
    val tabExit: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition? = {
        val from = TabRoutes.indexOf(initialState.destination.route)
        val to = TabRoutes.indexOf(targetState.destination.route)
        if (from >= 0 && to >= 0) {
            slideOutOfContainer(
                towards = if (to > from) SlideDirection.Left else SlideDirection.Right,
                animationSpec = slideSpec
            )
        } else {
            slideOutOfContainer(SlideDirection.Left, animationSpec = slideSpec)
        }
    }
    // 推入屏：从右滑入；被下一屏盖住时向左退出；返回时向右滑出（反向）
    val pushEnter: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition? = {
        slideIntoContainer(SlideDirection.Left, animationSpec = slideSpec)
    }
    val pushPopExit: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition? = {
        slideOutOfContainer(SlideDirection.Right, animationSpec = slideSpec)
    }
    val coveredExit: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition? = {
        slideOutOfContainer(SlideDirection.Left, animationSpec = slideSpec)
    }
    // 药品表单：从底部滑入，返回时向下滑回
    val formEnter: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition? = {
        slideIntoContainer(SlideDirection.Up, animationSpec = slideSpec)
    }
    val formPopExit: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition? = {
        slideOutOfContainer(SlideDirection.Down, animationSpec = slideSpec)
    }

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    TopLevel.entries.forEach { item ->
                        val selected = activeTab == item.route
                        NavigationBarItem(
                            selected = selected,
                            onClick = { navController.navigateTopLevel(item.route) },
                            modifier = Modifier.testId(item.testId),
                            icon = {
                                Icon(
                                    imageVector = if (selected) item.selectedIcon else item.icon,
                                    contentDescription = null
                                )
                            },
                            label = { Text(stringResource(item.labelRes)) },
                            colors = NavigationBarItemDefaults.colors(
                                indicatorColor = MaterialTheme.colorScheme.secondaryContainer
                            )
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = if (onboardingDone) Routes.HOME else Routes.ONBOARDING,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable(Routes.ONBOARDING) {
                OnboardingScreen(
                    onFinish = {
                        Prefs.setOnboardingDone(context, true)
                        onboardingDone = true
                        navController.navigate(Routes.HOME) {
                            popUpTo(Routes.ONBOARDING) { inclusive = true }
                        }
                    }
                )
            }

            composable(
                route = Routes.HOME,
                enterTransition = tabEnter,
                exitTransition = tabExit,
                popEnterTransition = tabEnter,
                popExitTransition = tabExit
            ) {
                HomeScreen(
                    viewModel = viewModel,
                    onOpenMedication = { navController.navigate(Routes.medicaDetail(it)) }
                )
            }

            composable(
                route = Routes.MEDICA,
                enterTransition = tabEnter,
                exitTransition = tabExit,
                popEnterTransition = tabEnter,
                popExitTransition = tabExit
            ) {
                MedicaListScreen(
                    viewModel = viewModel,
                    onOpenMedication = { navController.navigate(Routes.medicaDetail(it)) },
                    onAddMedication = { navController.navigate(Routes.medicaForm()) }
                )
            }

            composable(
                route = Routes.PROFILE,
                enterTransition = tabEnter,
                exitTransition = tabExit,
                popEnterTransition = tabEnter,
                popExitTransition = tabExit
            ) {
                ProfileScreen(
                    viewModel = viewModel,
                    onOpenRecords = { navController.navigate(Routes.RECORDS) },
                    onOpenSettings = { navController.navigate(Routes.SETTINGS) },
                    onOpenPersons = { navController.navigate(Routes.PERSONS) },
                    onOpenPerson = { navController.navigate(Routes.personDetail(it)) },
                    onOpenMedication = {
                        navController.navigate(Routes.medicaDetail(it))
                    }
                )
            }

            composable(
                route = Routes.RECORDS,
                enterTransition = pushEnter,
                exitTransition = coveredExit,
                popEnterTransition = pushEnter,
                popExitTransition = pushPopExit
            ) {
                RecordsScreen(
                    viewModel = viewModel,
                    onBack = { navController.popBackStack() }
                )
            }

            composable(
                route = Routes.SETTINGS,
                enterTransition = pushEnter,
                exitTransition = coveredExit,
                popEnterTransition = pushEnter,
                popExitTransition = pushPopExit
            ) {
                SettingsScreen(
                    viewModel = viewModel,
                    onBack = { navController.popBackStack() }
                )
            }

            composable(
                route = Routes.PERSONS,
                enterTransition = pushEnter,
                exitTransition = coveredExit,
                popEnterTransition = pushEnter,
                popExitTransition = pushPopExit
            ) {
                PersonsScreen(
                    viewModel = viewModel,
                    onBack = { navController.popBackStack() },
                    onOpenPerson = { navController.navigate(Routes.personDetail(it)) }
                )
            }

            composable(
                route = Routes.MEDICA_DETAIL,
                arguments = listOf(navArgument(Routes.ARG_MEDICATION_ID) { type = NavType.StringType }),
                enterTransition = pushEnter,
                exitTransition = coveredExit,
                popEnterTransition = pushEnter,
                popExitTransition = pushPopExit
            ) { entry ->
                MedicaDetailScreen(
                    viewModel = viewModel,
                    medicationId = entry.arguments?.getString(Routes.ARG_MEDICATION_ID).orEmpty(),
                    onBack = { navController.popBackStack() },
                    onEdit = { navController.navigate(Routes.medicaForm(it)) },
                    onOpenTwin = { navController.navigate(Routes.medicaTwin(it)) },
                    onAddPlan = { medicationId ->
                        navController.navigate(Routes.planForm(medicationId = medicationId))
                    }
                )
            }

            composable(
                route = Routes.MEDICA_FORM,
                arguments = listOf(
                    navArgument(Routes.ARG_MEDICATION_ID) {
                        type = NavType.StringType
                        defaultValue = ""
                    }
                ),
                enterTransition = formEnter,
                exitTransition = coveredExit,
                popEnterTransition = pushEnter,
                popExitTransition = formPopExit
            ) { entry ->
                MedicaFormScreen(
                    viewModel = viewModel,
                    medicationId = entry.arguments?.getString(Routes.ARG_MEDICATION_ID)?.ifEmpty { null },
                    onBack = { navController.popBackStack() },
                    // 保存并设置提醒：表单出栈，直接进配置表单（一次 navigate 完成）
                    onSavedWithPlan = { medicationId ->
                        navController.navigate(Routes.planForm(medicationId = medicationId)) {
                            popUpTo(Routes.MEDICA_FORM) { inclusive = true }
                        }
                    }
                )
            }

            composable(
                route = Routes.MEDICA_TWIN,
                arguments = listOf(navArgument(Routes.ARG_MEDICATION_ID) { type = NavType.StringType }),
                enterTransition = pushEnter,
                exitTransition = coveredExit,
                popEnterTransition = pushEnter,
                popExitTransition = pushPopExit
            ) { entry ->
                BlisterTwinScreen(
                    viewModel = viewModel,
                    medicationId = entry.arguments?.getString(Routes.ARG_MEDICATION_ID).orEmpty(),
                    onBack = { navController.popBackStack() }
                )
            }

            composable(
                route = Routes.PERSON_DETAIL,
                arguments = listOf(navArgument(Routes.ARG_PERSON_ID) { type = NavType.StringType }),
                enterTransition = pushEnter,
                exitTransition = coveredExit,
                popEnterTransition = pushEnter,
                popExitTransition = pushPopExit
            ) { entry ->
                val personIdArg = entry.arguments?.getString(Routes.ARG_PERSON_ID).orEmpty()
                PersonDetailScreen(
                    viewModel = viewModel,
                    personId = entry.arguments?.getString(Routes.ARG_PERSON_ID).orEmpty(),
                    onBack = { navController.popBackStack() },
                    onEditPlan = { planId ->
                        navController.navigate(Routes.planForm(planId = planId))
                    },
                    onAddPlan = {
                        navController.navigate(Routes.planForm(personId = personIdArg))
                    }
                )
            }

            composable(
                route = Routes.PLAN_FORM,
                arguments = listOf(
                    navArgument(Routes.ARG_PLAN_ID) {
                        type = NavType.StringType
                        defaultValue = ""
                    },
                    navArgument(Routes.ARG_PERSON_ID) {
                        type = NavType.StringType
                        defaultValue = ""
                    },
                    navArgument(Routes.ARG_MEDICATION_ID) {
                        type = NavType.StringType
                        defaultValue = ""
                    }
                ),
                enterTransition = pushEnter,
                exitTransition = coveredExit,
                popEnterTransition = pushEnter,
                popExitTransition = pushPopExit
            ) { entry ->
                val planId = entry.arguments?.getString(Routes.ARG_PLAN_ID)?.ifEmpty { null }
                val personId = entry.arguments?.getString(Routes.ARG_PERSON_ID)?.ifEmpty { null }
                val medicationId = entry.arguments?.getString(Routes.ARG_MEDICATION_ID)?.ifEmpty { null }
                PlanFormScreen(
                    viewModel = viewModel,
                    planId = planId,
                    personId = personId,
                    medicationId = medicationId,
                    onBack = { navController.popBackStack() }
                )
            }
        }
    }
}

/** tab 切换：保留各 tab 的滚动与状态，不重复入栈。 */
private fun NavHostController.navigateTopLevel(route: String) {
    navigate(route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
