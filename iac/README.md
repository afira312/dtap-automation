<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.15.8, < 2.0.0 |
| <a name="requirement_azapi"></a> [azapi](#requirement\_azapi) | ~> 2.11 |
| <a name="requirement_azurerm"></a> [azurerm](#requirement\_azurerm) | ~> 4.0 |

## Providers

No providers.

## Modules

| Name | Source | Version |
| ---- | ------ | ------- |
| <a name="module_spa-01"></a> [spa-01](#module\_spa-01) | ./_modules/spa | n/a |

## Resources

No resources.

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| <a name="input_asp_sku_name"></a> [asp\_sku\_name](#input\_asp\_sku\_name) | App service plan SKU name. B1-3, S1-10, P*, Y1, F1 | `string` | `"B1"` | no |
| <a name="input_environment"></a> [environment](#input\_environment) | The environment for the resources. | `string` | `"dev"` | no |
| <a name="input_location"></a> [location](#input\_location) | The location where the resource group will be created. | `string` | n/a | yes |
| <a name="input_resourcePrefix"></a> [resourcePrefix](#input\_resourcePrefix) | This string will be used for all resource namings. <pre>-rg, <pre>-asp, <pre>-app | `string` | n/a | yes |
| <a name="input_subscription_id"></a> [subscription\_id](#input\_subscription\_id) | Subscription Id to set azure context | `string` | n/a | yes |
| <a name="input_tags"></a> [tags](#input\_tags) | A map of tags to assign to the resources. | `map(string)` | `{}` | no |

## Outputs

No outputs.
<!-- END_TF_DOCS -->