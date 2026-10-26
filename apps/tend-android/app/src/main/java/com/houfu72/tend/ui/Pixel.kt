package com.houfu72.tend.ui

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cbrt
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

// The pixel pieces from focus/pixel.js: the 16x14 tomato and the stepped ring of blocks.

// k outline, r body, s shade, h highlight, G leaf, g leaf light. Drawn to match tomato-button.png.
private val TOMATO = listOf(
    ".......GG.......",
    "....GG.GG.GG....",
    ".....GGGGGG.....",
    "...kkGGggGGkk...",
    "..krrrGggGrrrk..",
    ".krhhrrGGrrrrrk.",
    ".krhrrrrrrrrrrk.",
    "krhrrrrrrrrrrrsk",
    "krrrrrrrrrrrrrsk",
    "krrrrrrrrrrrrssk",
    ".krrrrrrrrrrssk.",
    ".krsrrrrrrrsssk.",
    "..kssssssssssk..",
    "...kkkkkkkkkk..."
)

/** The pixel tomato. [ripe] runs from 0 (green) to 1 (red), mixed in OKLCH so it passes through orange, not brown. */
@Composable
fun PixelTomato(modifier: Modifier, ripe: Float = 1f) {
    val body = mixOklch(Px.tomato, Px.unripe, ripe)
    val shade = mixOklch(Px.tomatoDeep, Px.unripeDeep, ripe)
    Canvas(modifier) {
        val cell = minOf(size.width / 16f, size.height / 14f)
        val left = (size.width - cell * 16) / 2
        val top = (size.height - cell * 14) / 2
        TOMATO.forEachIndexed { y, row ->
            row.forEachIndexed { x, c ->
                val color = when (c) {
                    'k' -> Color(0xFF2B0E09); 'h' -> Color(0xFFFFD3C7); 'G' -> Color(0xFF2F9E57); 'g' -> Color(0xFF76F7A5)
                    'r' -> body; 's' -> shade; else -> null
                }
                // A hair of overlap hides seams between cells at fractional scales.
                if (color != null) drawRect(color, Offset(left + x * cell, top + y * cell), Size(cell + 0.5f, cell + 0.5f))
            }
        }
    }
}

/** A midpoint circle of radius 17 cells on an 8-unit grid in a 320-unit dial, clockwise from 12 o'clock. */
val RING: List<Pair<Int, Int>> = run {
    val points = mutableListOf<Pair<Int, Int>>()
    val seen = HashSet<Pair<Int, Int>>()
    var x = 17; var y = 0; var error = 1 - 17
    while (x >= y) {
        listOf(x to y, y to x, -y to x, -x to y, -x to -y, -y to -x, y to -x, x to -y).forEach { if (seen.add(it)) points += it }
        y++
        if (error < 0) error += 2 * y + 1 else { x--; error += 2 * (y - x) + 1 }
    }
    fun turn(p: Pair<Int, Int>) = (atan2(p.first.toDouble(), -p.second.toDouble()) + 2 * PI) % (2 * PI)
    points.sortedBy(::turn)
}

/**
 * The ring of blocks that empties clockwise as the interval passes. [left] is the share of time remaining;
 * the leading block blinks while [blinkOn] alternates.
 */
@Composable
fun PixelRing(modifier: Modifier, left: Float, onColor: Color, running: Boolean, blinkOn: Boolean) {
    val count = ceil(left * RING.size - 1e-6f).toInt()
    Canvas(modifier) {
        val unit = size.minDimension / 320f
        val block = 6 * unit
        RING.forEachIndexed { i, (dx, dy) ->
            val on = i >= RING.size - count
            val head = on && i == RING.size - count
            val color = when {
                !on -> Px.ringOff
                head && running && !blinkOn -> onColor.copy(alpha = 0.12f)
                else -> onColor
            }
            val px = floor((157 + dx * 8) * unit)
            val py = floor((157 + dy * 8) * unit)
            drawRect(color, Offset(px, py), Size(block, block))
        }
    }
}

// color-mix(in oklch, a p%, b): convert both to OKLCH, interpolate (hue the short way round) and back to sRGB.
fun mixOklch(a: Color, b: Color, p: Float): Color {
    val (l1, c1, h1) = toOklch(a)
    val (l2, c2, h2) = toOklch(b)
    var dh = h1 - h2
    if (dh > 180) dh -= 360
    if (dh < -180) dh += 360
    val q = p.coerceIn(0f, 1f).toDouble()
    return fromOklch(l2 + (l1 - l2) * q, c2 + (c1 - c2) * q, h2 + dh * q)
}

private fun linear(c: Float): Double = if (c <= 0.04045f) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
private fun gamma(c: Double): Float = (if (c <= 0.0031308) 12.92 * c else 1.055 * c.pow(1 / 2.4) - 0.055).toFloat().coerceIn(0f, 1f)

private fun toOklch(color: Color): Triple<Double, Double, Double> {
    val r = linear(color.red); val g = linear(color.green); val b = linear(color.blue)
    val l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    val m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    val s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    val lab = Triple(0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)
    val hue = (Math.toDegrees(atan2(lab.third, lab.second)) + 360) % 360
    return Triple(lab.first, sqrt(lab.second * lab.second + lab.third * lab.third), hue)
}

private fun fromOklch(lightness: Double, chroma: Double, hue: Double): Color {
    val a = chroma * cos(Math.toRadians(hue)); val b = chroma * sin(Math.toRadians(hue))
    val l = (lightness + 0.3963377774 * a + 0.2158037573 * b).pow(3)
    val m = (lightness - 0.1055613458 * a - 0.0638541728 * b).pow(3)
    val s = (lightness - 0.0894841775 * a - 1.2914855480 * b).pow(3)
    return Color(
        gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        gamma(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    )
}
