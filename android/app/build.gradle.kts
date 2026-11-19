import java.util.Properties

plugins {
    id("com.android.application")
}

// Signaturschlüssel: liegt nur lokal (keystore.properties und die .jks-Datei sind nicht im Repo).
// Für Updates muss jede neue APK mit demselben Schlüssel signiert sein.
val keystoreFile = rootProject.file("keystore.properties")
val keystore = Properties().apply { if (keystoreFile.exists()) keystoreFile.inputStream().use { load(it) } }

android {
    namespace = "io.github.lp867.meridian"
    compileSdk = 37

    defaultConfig {
        applicationId = "io.github.lp867.meridian"
        minSdk = 26
        targetSdk = 36
        // Bei jeder neuen APK beide erhöhen
        versionCode = 1
        versionName = "1.0"
    }

    signingConfigs {
        if (keystoreFile.exists()) {
            create("release") {
                storeFile = rootProject.file(keystore.getProperty("storeFile"))
                storePassword = keystore.getProperty("storePassword")
                keyAlias = keystore.getProperty("keyAlias")
                keyPassword = keystore.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // Verkleinern: 4,4 MB → 0,6 MB. Alle Aktivitäten der Bibliothek müssen im Manifest stehen,
            // sonst benennt R8 sie um und die App stürzt beim Start ab.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // Trusted Web Activity: zeigt die Website in Chrome, aber als eigene App ohne Adressleiste
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
}
