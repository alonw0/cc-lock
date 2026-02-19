#!/usr/bin/env swift
// Generates AppIcon.iconset PNG files for CCLock using CoreGraphics.
// Usage:  swift generate-icon.swift <output-dir>
//         iconutil -c icns <output-dir> -o AppIcon.icns

import Foundation
import CoreGraphics
import ImageIO

func cgColor(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> CGColor {
    CGColor(red: r, green: g, blue: b, alpha: a)
}

func makeIcon(pixels s: Int) -> CGImage {
    let f = CGFloat(s)
    let ctx = CGContext(
        data: nil, width: s, height: s,
        bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )!

    let bg    = cgColor(0.07, 0.07, 0.18)  // dark navy/indigo
    let white = cgColor(1, 1, 1)

    // 1. Background — dark-indigo rounded square
    ctx.setFillColor(bg)
    ctx.addPath(CGPath(
        roundedRect: CGRect(x: 0, y: 0, width: f, height: f),
        cornerWidth: f * 0.22, cornerHeight: f * 0.22, transform: nil
    ))
    ctx.fillPath()

    // 2. Shackle — draw first so the lock body covers the lower legs naturally.
    //    Coordinate system: origin bottom-left, y increases upward (standard CGContext).
    let legL   = f * 0.345          // left  leg x-centre
    let legR   = f * 0.655          // right leg x-centre
    let arcCX  = f * 0.500          // arc centre x
    let arcCY  = f * 0.720          // arc centre y  (top of shackle arch)
    let arcR   = (legR - legL) / 2  // = f * 0.155
    let legBot = f * 0.405          // y where legs disappear into the body

    ctx.setStrokeColor(white)
    ctx.setLineWidth(f * 0.100)
    ctx.setLineCap(.round)
    ctx.beginPath()
    ctx.move(to:    CGPoint(x: legL, y: legBot))
    ctx.addLine(to: CGPoint(x: legL, y: arcCY))
    // Arc from π (left) to 0 (right), counter-clockwise → traces the TOP half
    ctx.addArc(
        center: CGPoint(x: arcCX, y: arcCY),
        radius: arcR, startAngle: .pi, endAngle: 0, clockwise: false
    )
    ctx.addLine(to: CGPoint(x: legR, y: legBot))
    ctx.strokePath()

    // 3. Lock body — white rounded rectangle, covers lower shackle legs
    let bx = f*0.215, by = f*0.075, bw = f*0.570, bh = f*0.385
    ctx.setFillColor(white)
    ctx.addPath(CGPath(
        roundedRect: CGRect(x: bx, y: by, width: bw, height: bh),
        cornerWidth: f * 0.07, cornerHeight: f * 0.07, transform: nil
    ))
    ctx.fillPath()

    // 4. Keyhole — circle + teardrop, drawn in background colour to cut into body
    let khCX    = f * 0.500
    let khCY    = f * 0.250
    let khR     = f * 0.075
    let dropW   = f * 0.068
    let dropBot = f * 0.085
    let dropTop = khCY - khR + f * 0.005   // slight overlap so no gap

    ctx.setFillColor(bg)
    ctx.fillEllipse(in: CGRect(x: khCX - khR, y: khCY - khR, width: khR*2, height: khR*2))
    ctx.fill(CGRect(x: khCX - dropW/2, y: dropBot, width: dropW, height: dropTop - dropBot))

    return ctx.makeImage()!
}

func savePNG(_ img: CGImage, to path: String) {
    let url = URL(fileURLWithPath: path) as CFURL
    guard let dest = CGImageDestinationCreateWithURL(url, "public.png" as CFString, 1, nil) else {
        fputs("ERROR: cannot create destination for \(path)\n", stderr); return
    }
    CGImageDestinationAddImage(dest, img, nil)
    if !CGImageDestinationFinalize(dest) {
        fputs("ERROR: failed to write \(path)\n", stderr)
    }
}

let outDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."

let sizes: [(String, Int)] = [
    ("icon_16x16",        16),
    ("icon_16x16@2x",     32),
    ("icon_32x32",        32),
    ("icon_32x32@2x",     64),
    ("icon_128x128",     128),
    ("icon_128x128@2x",  256),
    ("icon_256x256",     256),
    ("icon_256x256@2x",  512),
    ("icon_512x512",     512),
    ("icon_512x512@2x", 1024),
]

for (name, pixels) in sizes {
    let img = makeIcon(pixels: pixels)
    savePNG(img, to: "\(outDir)/\(name).png")
    print("✓ \(name).png  (\(pixels)×\(pixels))")
}
