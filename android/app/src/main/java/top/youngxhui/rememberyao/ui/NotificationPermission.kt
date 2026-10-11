package top.youngxhui.rememberyao.ui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat

/**
 * 通知权限（Android 13+ 运行时权限）。
 *
 * 只在冷启动完成引导后问一次：用户拒了之后不再骚扰，设置页里说明原因，
 * 由用户自己去系统设置里开。反复弹框是这类权限最招人烦的用法。
 */
private object NotificationPermission {

    fun isGranted(context: Context): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
}

/**
 * 进入首页后弹一次通知权限申请。已授予就不弹。
 *
 * 放在这里而不是某个屏幕里：权限属于应用级关注点，不属于首页。
 */
@Composable
fun RequestNotificationPermissionOnce() {
    val context = LocalContext.current
    var asked by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { asked = true }
    )
    LaunchedEffect(Unit) {
        if (!asked && !NotificationPermission.isGranted(context)) {
            asked = true
            launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}

/** 设置页据此提示「权限没开，打开总开关也不会响」。 */
fun notificationPermissionGranted(context: Context): Boolean =
    NotificationPermission.isGranted(context)
