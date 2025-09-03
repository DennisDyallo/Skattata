// Copyright 2025 Yubico AB
// 
// Licensed under the Apache License, Version 2.0 (the "License").
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//     http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

namespace Skattata.Core;

public class SieAccount
{
    public SieAccount()
    {
        PeriodValues = new List<SiePeriodValue>();
        ObjectValues = new List<SiePeriodValue>();
    }
    public string AccountNumber { get; set; } = "";
    public string AccountName { get; set; } = "";
    public string Unit { get; set; } = "";
    public string AccountType { get; set; } = "";
    public List<SiePeriodValue> PeriodValues { get; }
    public List<SiePeriodValue> ObjectValues { get; }

    public decimal OpeningBalance { get; set; }
    public decimal ClosingBalance { get; set; }

    public decimal Balance { get; set; }
    public decimal Quantity { get; set; }
}