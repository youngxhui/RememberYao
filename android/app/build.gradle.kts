import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

// release 签名：读项目根的 keystore.properties（不随版本库分发）。
// 文件缺失时 release 退化为未签名 —— 至少保证 assembleRelease 能出包，
// 交付用的已签名 APK 由带 keystore.properties 的环境产出。
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) {
        keystorePropsFile.inputStream().use { load(it) }
    }
}

android {
    namespace = "top.youngxhui.rememberyao"
    // material3 1.5 要求编译期 API 37（本地已装 android-37.0）
    compileSdk = 37

    defaultConfig {
        // 必须与 iOS 的 PRODUCT_BUNDLE_IDENTIFIER 一致，且**不能**沿用 Expo 的
        // `.k3f9`：包名决定 `am start <pkg>/.MainActivity` 指向哪个安装体，
        // 两边不一致时模拟器上会有两个「RememberYao」，装错那个就永远起不来。
        applicationId = "top.youngxhui.rememberyao"
        minSdk = 34
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"
        // @RunWith(AndroidJUnit4) 要的 runner；不写死就取决于 AGP 的默认值
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        create("release") {
            if (keystorePropsFile.exists()) {
                storeFile = file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = false
            if (keystorePropsFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        // 设置页「版本」一行要读 versionName，走 BuildConfig 而不是再引 Constants
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
    arg("room.generateKotlin", "true")
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons.extended)
    debugImplementation(libs.compose.ui.tooling)

    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)

    implementation(libs.hilt.android)
    implementation(libs.hilt.navigation.compose)
    ksp(libs.hilt.compiler)

    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    // 领域层是纯函数，用最朴素的 JUnit 4 断言就够
    testImplementation(libs.junit)

    // UI 测试：Compose UI Test。版本交给 BOM，与主依赖里的 compose ui 保持一致
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test.junit4)
    // createComposeRule() 要用的空 Activity；本测试走 createAndroidComposeRule<MainActivity>()，
    // 按官方模板仍带上，省得以后写纯 Compose 测试时再补
    debugImplementation(libs.compose.ui.test.manifest)
    // 冷启动进首页的瞬间会弹通知权限申请框，盖住 tab 栏点不动：进测试前先授掉
    androidTestImplementation(libs.androidx.test.rules)
}
