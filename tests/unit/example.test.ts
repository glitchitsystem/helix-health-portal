describe("Example: simple arithmetic", () => {
  test("adds two positive numbers correctly", () => {
    // Arrange
    const a = 3;
    const b = 7;

    // Act
    const result = a + b;

    // Assert
    expect(result).toBe(10);
  });
});
