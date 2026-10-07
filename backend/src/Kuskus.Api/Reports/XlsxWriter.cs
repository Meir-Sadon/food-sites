using System.IO.Compression;
using System.Security;
using System.Text;

namespace Kuskus.Api.Reports;

/// <summary>A worksheet: a name, a header row and data rows of text or numbers.</summary>
public record Sheet(string Name, IReadOnlyList<string> Header, IReadOnlyList<object?[]> Rows);

/// <summary>Writes a plain .xlsx workbook (right-to-left sheets, bold header) without any third-party library.</summary>
public static class XlsxWriter
{
    public const string ContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    public static byte[] Write(IReadOnlyList<Sheet> sheets)
    {
        using var stream = new MemoryStream();
        using (var zip = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            Add(zip, "[Content_Types].xml", ContentTypes(sheets.Count));
            Add(zip, "_rels/.rels",
                Xml("""<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>"""));
            Add(zip, "xl/workbook.xml", Workbook(sheets));
            Add(zip, "xl/_rels/workbook.xml.rels", WorkbookRels(sheets.Count));
            Add(zip, "xl/styles.xml",
                Xml("""<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>"""));
            for (var i = 0; i < sheets.Count; i++)
                Add(zip, $"xl/worksheets/sheet{i + 1}.xml", Worksheet(sheets[i]));
        }
        return stream.ToArray();
    }

    private static string Xml(string body) => "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n" + body;

    private static void Add(ZipArchive zip, string path, string content)
    {
        var entry = zip.CreateEntry(path, CompressionLevel.Optimal);
        using var writer = new StreamWriter(entry.Open(), new UTF8Encoding(false));
        writer.Write(content);
    }

    private static string ContentTypes(int sheets)
    {
        var overrides = string.Concat(Enumerable.Range(1, sheets).Select(i =>
            $"<Override PartName=\"/xl/worksheets/sheet{i}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>"));
        return Xml("<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
            + "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
            + "<Default Extension=\"xml\" ContentType=\"application/xml\"/>"
            + "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>"
            + "<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>"
            + overrides + "</Types>");
    }

    private static string Workbook(IReadOnlyList<Sheet> sheets)
    {
        var entries = string.Concat(sheets.Select((s, i) =>
            $"<sheet name=\"{Escape(SheetName(s.Name))}\" sheetId=\"{i + 1}\" r:id=\"rId{i + 1}\"/>"));
        return Xml("<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" "
            + "xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">"
            + $"<sheets>{entries}</sheets></workbook>");
    }

    private static string WorkbookRels(int sheets)
    {
        var rels = string.Concat(Enumerable.Range(1, sheets).Select(i =>
            $"<Relationship Id=\"rId{i}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet{i}.xml\"/>"));
        return Xml("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
            + rels
            + $"<Relationship Id=\"rId{sheets + 1}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>"
            + "</Relationships>");
    }

    private static string Worksheet(Sheet sheet)
    {
        var sb = new StringBuilder();
        sb.Append("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">");
        sb.Append("<sheetViews><sheetView rightToLeft=\"1\" workbookViewId=\"0\"/></sheetViews><sheetData>");
        AppendRow(sb, 1, sheet.Header.Cast<object?>().ToArray(), bold: true);
        for (var r = 0; r < sheet.Rows.Count; r++)
            AppendRow(sb, r + 2, sheet.Rows[r], bold: false);
        sb.Append("</sheetData></worksheet>");
        return Xml(sb.ToString());
    }

    private static void AppendRow(StringBuilder sb, int row, object?[] cells, bool bold)
    {
        sb.Append($"<row r=\"{row}\">");
        for (var c = 0; c < cells.Length; c++)
        {
            var reference = $"{Column(c)}{row}";
            var style = bold ? " s=\"1\"" : "";
            switch (cells[c])
            {
                case null:
                    break;
                case decimal or int or long or double:
                    sb.Append($"<c r=\"{reference}\"{style}><v>{Convert.ToString(cells[c], System.Globalization.CultureInfo.InvariantCulture)}</v></c>");
                    break;
                default:
                    sb.Append($"<c r=\"{reference}\"{style} t=\"inlineStr\"><is><t xml:space=\"preserve\">{Escape(cells[c]!.ToString()!)}</t></is></c>");
                    break;
            }
        }
        sb.Append("</row>");
    }

    /// <summary>0 as "A", 25 as "Z", 26 as "AA".</summary>
    public static string Column(int index)
    {
        var name = "";
        for (var n = index + 1; n > 0; n = (n - 1) / 26)
            name = (char)('A' + (n - 1) % 26) + name;
        return name;
    }

    // Sheet names hold at most 31 characters and none of : \ / ? * [ ].
    private static string SheetName(string name)
    {
        var clean = new string(name.Where(c => !":\\/?*[]".Contains(c)).ToArray());
        return clean.Length is 0 ? "Sheet" : clean[..Math.Min(clean.Length, 31)];
    }

    private static string Escape(string text) =>
        SecurityElement.Escape(new string(text.Where(c => c >= ' ' || c is '\n' or '\r' or '\t').ToArray()))!;
}
