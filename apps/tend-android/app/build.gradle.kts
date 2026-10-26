plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

// The upload key lives outside the repository. ~/.gradle/gradle.properties names it:
// TEND_UPLOAD_STORE_FILE, TEND_UPLOAD_STORE_PASSWORD, TEND_UPLOAD_KEY_ALIAS, TEND_UPLOAD_KEY_PASSWORD.
val uploadStore = providers.gradleProperty("TEND_UPLOAD_STORE_FILE").orNull

android {
    namespace = "com.houfu72.tend"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.houfu72.tend"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        if (uploadStore != null) {
            create("upload") {
                storeFile = file(uploadStore)
                storePassword = providers.gradleProperty("TEND_UPLOAD_STORE_PASSWORD").get()
                keyAlias = providers.gradleProperty("TEND_UPLOAD_KEY_ALIAS").get()
                keyPassword = providers.gradleProperty("TEND_UPLOAD_KEY_PASSWORD").get()
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (uploadStore != null) signingConfig = signingConfigs.getByName("upload")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2026.09.00")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.core:core-ktx:1.19.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.12.0")
    testImplementation("junit:junit:4.13.2")
}
