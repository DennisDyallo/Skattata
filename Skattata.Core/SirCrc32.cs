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
/// Computes a CRC32 checksum.
/// </summary>
public class SieCrc32
{
    private readonly uint[] _table;
    private uint _value;

    public SieCrc32()
    {
        _table = new uint[256];
        for (uint i = 0; i < 256; i++)
        {
            var entry = i;
            for (var j = 0; j < 8; j++)
            {
                if ((entry & 1) == 1)
                    entry = (entry >> 1) ^ 0xEDB88320;
                else
                    entry >>= 1;
            }
            _table[i] = entry;
        }
    }

    public void Add(byte b)
    {
        _value = (_value >> 8) ^ _table[(_value & 0xFF) ^ b];
    }
    
    public void Add(byte[] bytes)
    {
        foreach (var b in bytes)
        {
            Add(b);
        }
    }

    public uint Get()
    {
        return ~_value;
    }
    
    public void Reset()
    {
        _value = uint.MaxValue;
    }
}