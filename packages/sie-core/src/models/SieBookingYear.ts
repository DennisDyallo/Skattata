export class SieBookingYear {
  id: number = 0;
  startDate: Date = new Date(0);
  endDate: Date = new Date(0);

  toString(): string {
    return `${this.id} (${this.startDate.toISOString().slice(0, 10)} to ${this.endDate.toISOString().slice(0, 10)})`;
  }
}
