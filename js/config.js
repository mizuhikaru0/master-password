function generatePassword() {
  const part1 = 1 << 9; // 512
  const part2 = 12345678 - 87017;
  return part1 * part2; 
}

export { generatePassword };
