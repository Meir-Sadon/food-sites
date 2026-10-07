using Kuskus.Api.Auth;

namespace Kuskus.Api.Tests;

public class AdminPasswordHasherTests
{
    [Fact]
    public void Verify_accepts_the_hashed_password()
    {
        var hash = AdminPasswordHasher.Hash("סיסמה-סודית");
        Assert.True(AdminPasswordHasher.Verify(hash, "סיסמה-סודית"));
    }

    [Fact]
    public void Verify_rejects_a_wrong_password()
    {
        var hash = AdminPasswordHasher.Hash("right");
        Assert.False(AdminPasswordHasher.Verify(hash, "wrong"));
        Assert.False(AdminPasswordHasher.Verify(hash, ""));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not-a-valid-hash")]
    public void Verify_rejects_missing_or_malformed_hashes(string? hash)
    {
        Assert.False(AdminPasswordHasher.Verify(hash, "anything"));
    }

    [Fact]
    public void Hash_is_salted_and_never_contains_the_password()
    {
        var first = AdminPasswordHasher.Hash("same-password");
        var second = AdminPasswordHasher.Hash("same-password");
        Assert.NotEqual(first, second);
        Assert.DoesNotContain("same-password", first);
    }
}
