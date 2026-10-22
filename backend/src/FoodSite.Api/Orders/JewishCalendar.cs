using System.Globalization;

namespace FoodSite.Api.Orders;

/// <summary>Holidays (the days work stops, as kept in Israel) and the sun's times, for the Shabbat and holiday hours.</summary>
public static class JewishCalendar
{
    private static readonly HebrewCalendar Hebrew = new();

    /// <summary>Rosh Hashana (2 days), Yom Kippur, Sukkot, Shemini Atzeret, the first and last day of Pesach and Shavuot.</summary>
    public static bool IsHoliday(DateOnly date)
    {
        var d = date.ToDateTime(TimeOnly.MinValue);
        var year = Hebrew.GetYear(d);
        var month = Hebrew.GetMonth(d);
        var day = Hebrew.GetDayOfMonth(d);
        var leap = Hebrew.IsLeapYear(year);
        var nisan = leap ? 8 : 7;
        var sivan = leap ? 10 : 9;
        return (month, day) switch
        {
            (1, 1 or 2 or 10 or 15 or 22) => true,
            _ when month == nisan && day is 15 or 21 => true,
            _ when month == sivan && day == 6 => true,
            _ => false,
        };
    }

    public static bool IsShabbat(DateOnly date) => date.DayOfWeek == DayOfWeek.Saturday;

    /// <summary>A day with no work: Shabbat or a holiday.</summary>
    public static bool IsRestDay(DateOnly date) => IsShabbat(date) || IsHoliday(date);

    /// <summary>Local time at which the sun is <paramref name="zenith"/> degrees from straight up on its way down (90.833 = sunset).</summary>
    public static TimeSpan SunDown(DateOnly date, double latitude, double longitude, TimeZoneInfo zone, double zenith = 90.833)
    {
        // NOAA's solar calculator, evaluated at noon UTC: accurate to about a minute, which is enough here.
        var jd = date.DayNumber + 1721425.5 + 0.5;
        var t = (jd - 2451545.0) / 36525.0;
        double Rad(double deg) => deg * Math.PI / 180;
        double Deg(double rad) => rad * 180 / Math.PI;

        var l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
        var m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
        var e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
        var c = Math.Sin(Rad(m)) * (1.914602 - t * (0.004817 + 0.000014 * t))
              + Math.Sin(Rad(2 * m)) * (0.019993 - 0.000101 * t)
              + Math.Sin(Rad(3 * m)) * 0.000289;
        var omega = 125.04 - 1934.136 * t;
        var lambda = l0 + c - 0.00569 - 0.00478 * Math.Sin(Rad(omega));
        var eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
        var eps = eps0 + 0.00256 * Math.Cos(Rad(omega));
        var decl = Math.Asin(Math.Sin(Rad(eps)) * Math.Sin(Rad(lambda)));
        var y = Math.Pow(Math.Tan(Rad(eps / 2)), 2);
        var eq = 4 * Deg(y * Math.Sin(2 * Rad(l0)) - 2 * e * Math.Sin(Rad(m))
               + 4 * e * y * Math.Sin(Rad(m)) * Math.Cos(2 * Rad(l0))
               - 0.5 * y * y * Math.Sin(4 * Rad(l0)) - 1.25 * e * e * Math.Sin(2 * Rad(m)));

        var cosHa = Math.Cos(Rad(zenith)) / (Math.Cos(Rad(latitude)) * Math.Cos(decl))
                  - Math.Tan(Rad(latitude)) * Math.Tan(decl);
        var ha = Deg(Math.Acos(Math.Clamp(cosHa, -1, 1)));
        var utcMinutes = 720 - 4 * (longitude - ha) - eq;

        var utc = date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc).AddMinutes(utcMinutes);
        var local = TimeZoneInfo.ConvertTimeFromUtc(utc, zone);
        return TimeSpan.FromMinutes(Math.Floor(local.TimeOfDay.TotalMinutes));
    }
}
