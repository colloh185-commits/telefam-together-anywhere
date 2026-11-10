plugins {
    kotlin("multiplatform")
    kotlin("plugin.serialization")
    id("com.android.library")
    id("org.jetbrains.compose")
    id("org.jetbrains.kotlin.plugin.compose")
}

kotlin {
    androidTarget()
    jvm("desktop")
    listOf(iosX64(), iosArm64(), iosSimulatorArm64()).forEach { target ->
        target.binaries.framework { baseName = "TelefamShared"; isStatic = true }
        target.compilations.getByName("main").cinterops.create("telefamcore") {
            defFile(project.file("src/nativeInterop/cinterop/telefamcore.def"))
            includeDirs(project.file("../../core-cpp/include"))
        }
    }

    sourceSets {
        commonMain.dependencies {
            implementation(compose.runtime)
            implementation(compose.foundation)
            implementation(compose.material3)
            implementation(compose.materialIconsExtended)
            implementation("org.jetbrains.compose.material3:material3-window-size-class:1.7.0")
            implementation("io.ktor:ktor-client-core:3.0.1")
            implementation("io.ktor:ktor-client-content-negotiation:3.0.1")
            implementation("io.ktor:ktor-serialization-kotlinx-json:3.0.1")
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
            implementation("org.jetbrains.kotlinx:kotlinx-datetime:0.6.1")
        }
        androidMain.dependencies {
            implementation("io.ktor:ktor-client-okhttp:3.0.1")
            implementation("androidx.activity:activity-compose:1.9.3")
            implementation("androidx.core:core-splashscreen:1.0.1")
            implementation("com.google.android.play:integrity:1.4.0")
        }
        iosMain.dependencies { implementation("io.ktor:ktor-client-darwin:3.0.1") }
        val desktopMain by getting { dependencies { implementation(compose.desktop.currentOs); implementation("io.ktor:ktor-client-java:3.0.1") } }
    }
}

android {
    namespace = "app.telefam.shared"
    compileSdk = 35
    defaultConfig { minSdk = 24 }
    externalNativeBuild { cmake { path = file("../../core-cpp/CMakeLists.txt") } }
}
