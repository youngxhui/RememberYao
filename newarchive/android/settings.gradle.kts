pluginManagement {
    repositories {
        google()
        mavenCentral()
        // 国内网络兜底：Aliyun 代理 Central，仅在前面仓库不可达时命中
        maven("https://maven.aliyun.com/repository/public")
        maven("https://maven.aliyun.com/repository/gradle-plugin")
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    // 用户全局 init.gradle 会往 project.repositories 注入 Aliyun 镜像，
    // 用 PREFER_SETTINGS 让 settings 里的仓库优先，同时不与之冲突。
    // 国内网络下 repo.maven.apache.org 握手不稳定（见 ~/.gradle/init.gradle），
    // 所以 Aliyun 的 Central / Google 完整代理排在 mavenCentral() 前面。
    repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)
    repositories {
        google()
        maven("https://maven.aliyun.com/repository/public")
        maven("https://maven.aliyun.com/repository/google")
        mavenCentral()
    }
}

rootProject.name = "RememberYao"
include(":app")
