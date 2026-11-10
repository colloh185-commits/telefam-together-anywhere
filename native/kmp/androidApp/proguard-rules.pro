# R8 full mode (gradle.properties: android.enableR8.fullMode=true)
-repackageclasses 'x'
-allowaccessmodification
-overloadaggressively
-adaptclassstrings
-renamesourcefileattribute ''
-keepattributes !SourceFile,!LineNumberTable,!LocalVariableTable,!LocalVariableTypeTable

# Strip all logging from release builds
-assumenosideeffects class android.util.Log { *; }
-assumenosideeffects class kotlin.io.ConsoleKt { *; }

# JNI entry points must keep their names
-keepclasseswithmembernames class * { native <methods>; }

# kotlinx.serialization
-keepclassmembers @kotlinx.serialization.Serializable class ** { *** Companion; kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class app.telefam.**$$serializer { *; }
