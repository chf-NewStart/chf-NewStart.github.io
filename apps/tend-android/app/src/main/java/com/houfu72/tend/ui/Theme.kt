package com.houfu72.tend.ui

import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.ImageShader
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.drawscope.CanvasDrawScope
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.houfu72.tend.R
import kotlin.math.max
import kotlin.math.roundToInt

// Tend's pixel room (focus/pixel.css over focus/theme.css): near-black paper, cream ink, mint and tomato,
// Plank Pixel for display text, IBM Plex Mono for what you type, DM Sans for reading.
object Px {
    val paper = Color(0xFF040706)
    val card = Color(0xFF0A0F0D)
    val ink = Color(0xFFF4EFDC)
    val muted = Color(0xFF8F9A92)
    val line = Color(0xFF1D2924)
    val edge = Color(0xFF26352E)
    val tomato = Color(0xFFFF5A43)
    val tomatoDeep = Color(0xFFB8321F)
    val unripe = Color(0xFF7FD35E)
    val unripeDeep = Color(0xFF4B913A)
    val green = Color(0xFF76F7A5)
    val blue = Color(0xFF6ED6E8)
    val intentionCard = Color(0xFF0B1310)
    val intentionEdge = Color(0xFF2D4A3A)
    val focusEdge = Color(0xFF4C8A66)
    val laterCard = Color(0xFF080C0A)
    val dialog = Color(0xFF070B09)
    val dialogEdge = Color(0xFF3B5146)
    val field = Color(0xFF060A08)
    val keyDark = Color(0xFF0C1410)
    val tabOn = Color(0xFF0E1913)
    val ringOff = Color(0xFF17211C)
    val pip = Color(0xFF3D5247)
    val toast = Color(0xFF06100C)
}

val PlankPixel = FontFamily(Font(R.font.plank_pixel))
val PlexMono = FontFamily(Font(R.font.plex_mono_regular, FontWeight.Normal), Font(R.font.plex_mono_medium, FontWeight.Medium))
val DmSans = FontFamily(
    Font(R.font.dm_sans_regular, FontWeight.Normal), Font(R.font.dm_sans_medium, FontWeight.Medium),
    Font(R.font.dm_sans_semibold, FontWeight.SemiBold)
)

object Type {
    val body = TextStyle(fontFamily = DmSans, fontSize = 13.sp, lineHeight = 21.sp, color = Px.ink)
    val small = TextStyle(fontFamily = DmSans, fontSize = 11.sp, lineHeight = 18.sp, color = Px.muted)
    val label = TextStyle(fontFamily = DmSans, fontSize = 12.sp, lineHeight = 18.sp, fontWeight = FontWeight.Medium, color = Px.ink)
    val eyebrow = TextStyle(fontFamily = PlexMono, fontSize = 9.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.13.em, color = Px.green)
    val mono = TextStyle(fontFamily = PlexMono, fontSize = 11.sp, color = Px.muted)
    val field = TextStyle(fontFamily = PlexMono, fontSize = 15.sp, lineHeight = 24.sp, color = Px.ink)
    val h1 = TextStyle(fontFamily = PlankPixel, fontSize = 30.sp, lineHeight = 35.sp, color = Px.ink)
    val h2 = TextStyle(fontFamily = PlankPixel, fontSize = 20.sp, lineHeight = 23.sp, color = Px.ink)
    val key = TextStyle(fontFamily = PlexMono, fontSize = 11.sp, letterSpacing = 0.07.em, color = Px.ink)
}

/** Notched pixel edges: four flat bars outside the box leave its corners open, like pixel.css's four shadows. */
fun Modifier.pixelFrame(edge: Color, width: Dp = 3.dp) = drawBehind {
    val w = width.toPx()
    drawRect(edge, Offset(0f, -w), Size(size.width, w))
    drawRect(edge, Offset(0f, size.height), Size(size.width, w))
    drawRect(edge, Offset(-w, 0f), Size(w, size.height))
    drawRect(edge, Offset(size.width, 0f), Size(w, size.height))
}

/** The room behind everything: a faint 8dp grid fading out from the top, under 1-in-3 scanlines. */
fun Modifier.roomBackground() = drawWithCache {
    val cell = max(2, (8.dp.toPx()).roundToInt())
    val grid = tile(this, cell, cell) { drawRect(Color(0xFF76F7A5).copy(alpha = 0.035f * 0.45f), Offset.Zero, Size(cell.toFloat(), 1f)); drawRect(Color(0xFF76F7A5).copy(alpha = 0.035f * 0.45f), Offset.Zero, Size(1f, cell.toFloat())) }
    val fade = Brush.radialGradient(
        listOf(Color.Transparent, Px.paper), center = Offset(size.width / 2, size.height * 0.25f),
        radius = max(size.width, size.height) * 0.72f
    )
    onDrawBehind {
        drawRect(Px.paper)
        drawRect(grid)
        drawRect(fade)
    }
}

fun Modifier.scanlines() = drawWithCache {
    val period = max(3, (3.dp.toPx()).roundToInt())
    val dark = max(1, (1.dp.toPx()).roundToInt())
    val lines = tile(this, 1, period) { drawRect(Color.Black.copy(alpha = 0.13f), Offset.Zero, Size(1f, dark.toFloat())) }
    onDrawWithContent {
        drawContent()
        drawRect(lines)
    }
}

private fun tile(density: Density, width: Int, height: Int, draw: androidx.compose.ui.graphics.drawscope.DrawScope.() -> Unit): ShaderBrush {
    val bitmap = ImageBitmap(width, height)
    CanvasDrawScope().draw(density, LayoutDirection.Ltr, androidx.compose.ui.graphics.Canvas(bitmap), Size(width.toFloat(), height.toFloat()), draw)
    return ShaderBrush(ImageShader(bitmap, TileMode.Repeated, TileMode.Repeated))
}
