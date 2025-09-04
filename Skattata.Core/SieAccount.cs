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

/// <summary>
/// Represents a financial account in a SIE document.
/// </summary>
public class SieAccount
{
    /// <summary>
    /// Initializes a new instance of the <see cref="SieAccount"/> class.
    /// </summary>
    public SieAccount()
    {
        PeriodValues = new List<SiePeriodValue>();
        ObjectValues = new List<SiePeriodValue>();
    }
    
    /// <summary>
    /// Gets or sets the account number.
    /// </summary>
    public string AccountNumber { get; set; } = "";
    
    /// <summary>
    /// Gets or sets the name of the account.
    /// </summary>
    public string AccountName { get; set; } = "";
    
    /// <summary>
    /// Gets or sets the unit for the account (e.g., "st" for pieces).
    /// </summary>
    public string Unit { get; set; } = "";
    
    /// <summary>
    /// Gets or sets the type of the account.
    /// </summary>
    public string AccountType { get; set; } = "";
    
    /// <summary>
    /// Gets the list of period-based balance values for this account.
    /// </summary>
    public List<SiePeriodValue> PeriodValues { get; }
    
    /// <summary>
    /// Gets the list of object-based balance values for this account.
    /// </summary>
    public List<SiePeriodValue> ObjectValues { get; }

    /// <summary>
    /// Gets or sets the opening balance for the account.
    /// </summary>
    public decimal OpeningBalance { get; set; }
    
    /// <summary>
    /// Gets or sets the closing balance for the account.
    /// </summary>
    public decimal ClosingBalance { get; set; }

    /// <summary>
    /// Gets or sets the balance of the account.
    /// </summary>
    public decimal Balance { get; set; }
    
    /// <summary>
    /// Gets or sets the quantity associated with the account balance.
    /// </summary>
    public decimal Quantity { get; set; }
}