import Foundation

/// Exact FCPXML time value ("1001/30000s", "10s"). Doubles would drift off frame boundaries.
struct RationalTime: Comparable, Hashable, CustomStringConvertible {
	private(set) var num: Int64
	private(set) var den: Int64

	static let zero = RationalTime(0)

	init(_ num: Int64, _ den: Int64 = 1) {
		precondition(den != 0, "denominator must not be 0")
		let sign: Int64 = den < 0 ? -1 : 1
		let g = Self.gcd(abs(num), abs(den))
		self.num = sign * num / max(g, 1)
		self.den = sign * den / max(g, 1)
	}

	/// parses an FCPXML time attribute
	init?(fcpxml raw: String?) {
		guard var s = raw?.trimmingCharacters(in: .whitespaces), !s.isEmpty else { return nil }
		if s.hasSuffix("s") { s.removeLast() }
		let parts = s.split(separator: "/")
		if parts.count == 1, let n = Int64(parts[0]) {
			self.init(n)
		} else if parts.count == 2, let n = Int64(parts[0]), let d = Int64(parts[1]), d != 0 {
			self.init(n, d)
		} else {
			return nil
		}
	}

	/// nearest frame of the given frame duration
	init(seconds: Double, frameDuration fd: RationalTime) {
		let frames = (seconds / fd.seconds).rounded()
		self = fd * Int64(frames)
	}

	var fcpxml: String { den == 1 ? "\(num)s" : "\(num)/\(den)s" }
	var seconds: Double { Double(num) / Double(den) }
	var description: String { fcpxml }

	/// whole frames of the given duration, rounded down
	func frames(of fd: RationalTime) -> Int64 {
		let q = (num * fd.den)
		let d = (den * fd.num)
		return q >= 0 ? q / d : -((-q + d - 1) / d)
	}

	func floored(to fd: RationalTime) -> RationalTime { fd * frames(of: fd) }

	/// HH:MM:SS:FF, non drop frame (display only)
	func timecode(frameDuration fd: RationalTime) -> String {
		let fps = Int64((1 / fd.seconds).rounded())
		let total = frames(of: fd)
		let sign = total < 0 ? "-" : ""
		let f = abs(total)
		return String(format: "%@%02lld:%02lld:%02lld:%02lld", sign, f / (fps * 3600), (f / (fps * 60)) % 60, (f / fps) % 60, f % fps)
	}

	static func + (a: Self, b: Self) -> Self {
		let l = lcm(a.den, b.den)
		return RationalTime(a.num * (l / a.den) + b.num * (l / b.den), l)
	}

	static func - (a: Self, b: Self) -> Self { a + RationalTime(-b.num, b.den) }
	static func * (a: Self, n: Int64) -> Self { RationalTime(a.num * n, a.den) }
	static func < (a: Self, b: Self) -> Bool { (a - b).num < 0 }

	private static func gcd(_ a: Int64, _ b: Int64) -> Int64 { b == 0 ? a : gcd(b, a % b) }
	private static func lcm(_ a: Int64, _ b: Int64) -> Int64 { a / gcd(a, b) * b }
}
